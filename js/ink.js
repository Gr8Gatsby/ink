﻿// ink.js
// This file contains the code to interact with the Windows Runtime Inking APIs

// This global variable holds a reference to the div that is imposed on top of selected ink.
// It is used to register event handlers that allow the user to move around selected ink.
var selBox;
var attrs;
var manager;

function InkManager(canvas) {
    this.isWRT = typeof Windows != 'undefined';
    manager = this.isWRT
        ? new Windows.UI.Input.Inking.InkManager
        : new SignaturePad(canvas);

    this.manager = manager;
    if (this.isWRT) {
        attrs = new Windows.UI.Input.Inking.InkDrawingAttributes;
        var stroke = attrs.size;
        var context = canvas.getContext('2d');

        attrs.size = stroke;
        attrs.color = Windows.UI.Colors.black;
        attrs.fitToCurve = true;
        stroke.width = stroke.height = context.lineWidth;

        manager.attrs = attrs;
        manager.mode = Windows.UI.Input.Inking.InkManipulationMode.inking;
        manager.setDefaultDrawingAttributes(attrs);

        this.getRecognitionResults = manager.getRecognitionResults.bind(manager);
        this.getStrokes = manager.getStrokes.bind(manager);
        this.processPointerDown = manager.processPointerDown.bind(manager);
        this.processPointerUpdate = manager.processPointerUpdate.bind(manager);
        this.processPointerUp = manager.processPointerUp.bind(manager);
        this.selectWithLine = manager.selectWithLine.bind(manager);
    }
}

InkManager.prototype = {
    getRecognitionResults: function() { return []; },
    getStrokes: function() { return []; },
    processPointerDown: function() {},
    processPointerUpdate: function() {},
    processPointerUp: function() {},
    selectWithLine: function() {},
    set color(value) {
        if (this.isWRT) {
            this._color = value;
        } else {
            this.manager.penColor = value;
        }
    },
    get color() {
        return this.isWRT ? this._color : this.manager.penColor;
    }
};

// Setup the application.
document.addEventListener('DOMContentLoaded', function () {
    // helper functions

    // Set the color (and alpha) of a stroke.  Return true if we actually changed it.
    // Note that we cannot just set the color in stroke.drawingAttributes.color.
    // The stroke API supports get and put operations for drawingAttributes,
    // but we must execute those operations separately, and change any values
    // inside drawingAttributes between those operations.
    function colorStroke(stroke, color) {
        var att = stroke.drawingAttributes;
        var clr = toColorStruct(color);
        if (att.color !== clr) {
            att.color = clr;
            stroke.drawingAttributes = att;
            return true;
        } else {
            return false;
        }
    }

    // Check to see if input is inside of the Canvas for drawing
    function inRect(x, y, rect) {
        return ((rect.x <= x) && (x < (rect.x + rect.width)) &&
                (rect.y <= y) && (y < (rect.y + rect.height)));
    }

    function handleSelectionBoxPointerDown(evt) {
        // Start the processing of events related to this pointer as part of a gesture.
        // In this sample we are interested in MSGestureChange event, which we use to move selected ink.
        // See handleSelectionBoxGestureChange event handler.
        selBox.gestureObject.addPointer(evt.pointerId);
    }

    function handleSelectionBoxGestureChange(evt) {
        // Move selection box
        selBox.rect.x += evt.translationX;
        selBox.rect.y += evt.translationY;
        selBox.style.left = selBox.rect.x + "px";
        selBox.style.top = selBox.rect.y + "px";

        // Move selected ink
        inkManager.moveSelected({ x: evt.translationX, y: evt.translationY });

        renderAllStrokes();
    }

    // Change the color and width in the default (used for new strokes) to the values
    // currently set in the current context.
    function setDefaults() {

        var strokeSize = attrs.size;
        strokeSize.width = strokeSize.height = context.lineWidth;
        attrs.size = strokeSize;
        attrs.color = hexStrToRGBA(context.strokeStyle);
        //attrs.drawAsHighlighter = context === hlContext;
        manager.setDefaultDrawingAttributes(attrs);
    }

    // Test the array of results bounding boxes
    // Draws a single stroke into a specified canvas 2D context, with a specified color and width.
    function renderStroke(stroke, color, width, ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;

        console.log('renderStroke: rgb color: r = ' + color.r + ' g = ' + color.g + ' b = ' + color.b);
        var first = true;
        stroke.getRenderingSegments().forEach(function (segment) {
            if (first) {
                ctx.moveTo(segment.position.x, segment.position.y);
                first = false;
            } else {
                ctx.bezierCurveTo(segment.bezierControlPoint1.x, segment.bezierControlPoint1.y,
                                    segment.bezierControlPoint2.x, segment.bezierControlPoint2.y,
                                    segment.position.x, segment.position.y);
            }
        });

        ctx.stroke();
        ctx.closePath();
        ctx.restore();
    }

    function hitTest(tx, ty) {
        var results = inkManager.getRecognitionResults();
        var cWords = results.size;
        if (cWords === 0) {
            return null;
        }
        for (var i = 0; i < cWords; i++) {
            var rect = results[i].boundingRect;
            if (inRect(tx, ty, rect)) {
                return {
                    index: i,
                    handleX: tx,  // Original touch point
                    handleY: ty,
                    strokes: results[i].getStrokes(),
                    rect: rect,
                    alternates: results[i].getTextCandidates()
                };
            }
        }
        return null;
    }

    // Tests the array of results bounding box
    function renderAllStrokes() {
        // Clear the last context
        ink.draw.context.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

        // Get all the strokes from the InkManager
        inkManager.getStrokes().forEach(function (stroke) {
            var att = stroke.drawingAttributes;
            var color = toColorString(att.color);
            var strokeSize = att.size;
            var width = strokeSize.width;
            var ctx = ink.draw.context;
            renderStroke(stroke, color, width, ctx);

        });
    }

    // Convenience function used by color converters.
    function byteHex(num) {
        var hex = num.toString(16);
        if (hex.length === 1) {
            hex = "0" + hex;
        }
        return hex;
    }

    function toColorString(color) {
        return "#" + byteHex(color.r) + byteHex(color.g) + byteHex(color.b);
    }

    function handleColorChange(evt) {
        inkManager.color = evt.srcElement.value;
    }

    // Handle Pointer events
    // We will accept pen down or mouse left down as the start of a stroke.
    // We will accept touch down or mouse right down as the start of a touch.
    function handlePointerDown(evt) {
        if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0)) || (evt.pointerType === "touch")) {
            // Anchor and clear any current selection.
            //anchorSelection();
            var pt = { x: 0.0, y: 0.0 };
            inkManager.selectWithLine(pt, pt);

            //clearButtonMenus();

            pt = evt.currentPoint;

            if (pt.properties.isEraser) { // The back side of a pen, which we treat as an eraser
                tempEraseMode();
            } else {
                //restoreMode();
            }

            context.beginPath();
            context.moveTo(pt.rawPosition.x, pt.rawPosition.y);

            var pressureWidth = evt.pressure * 15;
            ink.draw.context.lineWidth = pressureWidth;
            setDefaults();

            inkManager.processPointerDown(pt);
            penID = evt.pointerId;
        } else if (evt.pointerType === 'touch') {
            // Start the processing of events related to this pointer as part of a gesture.
            // In this sample we are interested in MSGestureTap event, which we use to show alternates. See handleTap event handler.
            ink.draw.canvas.gestureObject.addPointer(evt.pointerId);
        }
    }

    function handlePointerMove(evt) {
        if (evt.pointerId === penID) {
            var pt = evt.currentPoint;
            context.lineTo(pt.rawPosition.x, pt.rawPosition.y);
            context.stroke();
            // Get all the points we missed and feed them to inkManager.
            // The array pts has the oldest point in position length-1; the most recent point is in position 0.
            // Actually, the point in position 0 is the same as the point in pt above (returned by evt.currentPoint).
            var pts = evt.intermediatePoints;
            for (var i = pts.length - 1; i >= 0 ; i--) {
                inkManager.processPointerUpdate(pts[i]);
            }
        }
    }

    function handlePointerUp(evt) {
        if (evt.pointerId === penID) {
            penID = -1;
            var pt = evt.currentPoint;
            context.strokeStyle = inkManager.color;
            context.lineTo(pt.rawPosition.x, pt.rawPosition.y);
            context.stroke();
            context.closePath();

            var rect = inkManager.processPointerUp(pt);
            if (inkManager.mode === Windows.UI.Input.Inking.InkManipulationMode.selecting) {
                detachSelection(rect);
            }
            renderAllStrokes();
        }
    }

    // We treat the event of the pen leaving the canvas as the same as the pen lifting;
    // it completes the stroke.
    function handlePointerOut(evt) {
        if (evt.pointerId === penID) {
            var pt = evt.currentPoint;
            context.lineTo(pt.rawPosition.x, pt.rawPosition.y);
            context.stroke();
            context.closePath();
            inkManager.processPointerUp(pt);
            penID = -1;
            renderAllStrokes();
        }
    }

    var penID = -1;

    // Create a global object for managing canvases
    var ink = {
        draw:{
            canvas: null,
            context: null
        }
    };

    var canvas = document.getElementById('inkCanvas');
    var context = canvas.getContext('2d');
    var inputColor = document.getElementById('inputColor');

    canvas.setAttribute('width', inkCanvas.offsetWidth);
    canvas.setAttribute('height', inkCanvas.offsetHeight);

    context.lineWidth = 5;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    ink.draw.canvas = canvas;
    ink.draw.context = context;

    var inkManager = new InkManager(canvas);
    inkManager.color = inputColor.value;

    // Initialize the drawing canvas
    canvas.gestureObject = inkManager.isWRT ? new MSGesture : {};
    canvas.gestureObject.target = ink.draw.canvas;

    // Listeners.
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerout', handlePointerOut);
    inputColor.addEventListener('change', handleColorChange);
});
