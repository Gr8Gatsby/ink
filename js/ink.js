// ink.js
// This file contains the code to interact with the Windows Runtime Inking APIs

function InkManager(canvas) {
    this.isWRT = typeof Windows != 'undefined';

    canvas.setAttribute('width', canvas.offsetWidth);
    canvas.setAttribute('height', canvas.offsetHeight);

    var context = canvas.getContext('2d');
    context.lineWidth = 5;
    context.lineCap = context.lineJoin = 'round';

    var manager = this.isWRT
        ? new Windows.UI.Input.Inking.InkManager
        : new SignaturePad(canvas, { backgroundColor: 'white' });

    this.canvas = canvas;
    this.context = context;
    this.manager = manager;

    if (!this.isWRT) {
        // Wrap to force stroke width
        var _drawCurve = manager._drawCurve;
        manager._drawCurve = function(curve, startWidth, endWidth) {
            var pressure = 0.1;
            var width = pressure * InkManager.PRESSURE_MULTIPLIER;
            return _drawCurve.call(this, curve, width, width);
        };
        return;
    }
    var attrs = new Windows.UI.Input.Inking.InkDrawingAttributes;
    attrs.color = Windows.UI.Colors.black;
    attrs.fitToCurve = true;

    var stroke = attrs.size;
    stroke.width = stroke.height = context.lineWidth;

    canvas.gestureObject = new MSGesture;
    canvas.gestureObject.target = canvas;

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

InkManager.PRESSURE_MULTIPLIER = 15;

InkManager.prototype = {
    getRecognitionResults: function() { return []; },
    getStrokes: function() { return []; },
    processPointerDown: function() {},
    processPointerUpdate: function() {},
    processPointerUp: function() {},
    selectWithLine: function() {},

    set color(value) {
        if (this.isWRT) {
            this.context.strokeStyle = value;
        } else {
            this.manager.penColor = value;
        }
    },
    get color() {
        return this.isWRT
          ? this.context.strokeStyle
          : this.manager.penColor;
    },

    // Change the color and width in the default (used for new strokes) to the
    // values currently set in the current context.
    setDefaults: function() {
        if (this.isWRT) {
            var attrs = this.manager.attrs;
            var stroke = attrs.size;

            attrs.color = hexStrToRGBA(this.color);
            stroke.width = stroke.height = this.context.lineWidth;
            this.manager.setDefaultDrawingAttributes(attrs);
        }
    }
};

document.addEventListener('DOMContentLoaded', function() {

    // Test the array of results bounding boxes
    // Draws a single stroke into the canvas 2D context, with a specified color and width.
    function renderStroke(stroke, color, width) {
        var context = inkManager.context;
        context.save();
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = width;

        var first = true;
        stroke.getRenderingSegments().forEach(function(segment) {
            if (first) {
                first = false;
                context.moveTo(segment.position.x, segment.position.y);
            } else {
                context.bezierCurveTo(
                    segment.bezierControlPoint1.x, segment.bezierControlPoint1.y,
                    segment.bezierControlPoint2.x, segment.bezierControlPoint2.y,
                    segment.position.x, segment.position.y
                );
            }
        });

        context.stroke();
        context.closePath();
        context.restore();
    }

    // Tests the array of results bounding box
    function renderAllStrokes() {
        var canvas = inkManager.canvas;

        // Clear the last context
        inkManager.context.clearRect(0, 0, canvas.width, canvas.height);

        // Get all the strokes from the InkManager
        inkManager.getStrokes().forEach(function(stroke) {
            var attrs = stroke.drawingAttributes;
            renderStroke(stroke, toColorString(attrs.color), attrs.size.width);
        });
    }

    // Convenience function used by color converters.
    function byteHex(num) {
        var hex = num.toString(16);
        return (hex.length === 1 ?  '0' : '') + hex;
    }

    function toColorString(color) {
        return '#' + byteHex(color.r) + byteHex(color.g) + byteHex(color.b);
    }

    function handleColorChange(event) {
        inkManager.color = event.currentTarget.value;
        inkManager.setDefaults();
    }

    // Handle Pointer events
    // We will accept pen down or mouse left down as the start of a stroke.
    // We will accept touch down or mouse right down as the start of a touch.
    function handlePointerDown(event) {
        if ((event.pointerType === 'pen') ||
                (event.pointerType === 'mouse' && event.button === 0) ||
                    (event.pointerType === 'touch')
                ) {
            penID = event.pointerId;

            // Anchor and clear any current selection.
            //anchorSelection();
            var context = inkManager.context;
            var point = { x: 0, y: 0 };

            inkManager.selectWithLine(point, point);
            context.beginPath();

            point = event.currentPoint;
            context.moveTo(point.rawPosition.x, point.rawPosition.y);

            inkManager.context.lineWidth = event.pressure * InkManager.PRESSURE_MULTIPLIER;
            inkManager.setDefaults();
            inkManager.processPointerDown(point);
        }
        else if (event.pointerType === 'touch' && inkManager.canvas.gestureObject) {
            // Start the processing of events related to this pointer as part of a gesture.
            // In this sample we are interested in MSGestureTap event, which we use to show alternates. See handleTap event handler.
            inkManager.canvas.gestureObject.addPointer(event.pointerId);
        }
    }

    function handlePointerMove(event) {
        if (event.pointerId === penID) {
            var context = inkManager.context;
            var point = event.currentPoint;

            context.lineTo(point.rawPosition.x, point.rawPosition.y);
            context.stroke();
            // Get all the points we missed and feed them to inkManager.
            // The array points has the oldest point in position length-1; the most recent point is in position 0.
            // Actually, the point in position 0 is the same as the point in point above (returned by event.currentPoint).
            var points = event.intermediatePoints;
            for (var index = points.length - 1; index >= 0; index--) {
                inkManager.processPointerUpdate(points[index]);
            }
        }
    }

    function handlePointerUp(event) {
        if (event.pointerId === penID) {
            penID = -1;
            var context = inkManager.context;
            var point = event.currentPoint;

            context.strokeStyle = inkManager.color;
            context.lineTo(point.rawPosition.x, point.rawPosition.y);
            context.stroke();
            context.closePath();

            renderAllStrokes();
        }
    }

    // We treat the event of the pen leaving the canvas as the same as the pen lifting;
    // it completes the stroke.
    function handlePointerOut(event) {
        if (event.pointerId === penID) {
            penID = -1;
            var context = inkManager.context;
            var point = event.currentPoint;

            context.lineTo(point.rawPosition.x, point.rawPosition.y);
            context.stroke();
            context.closePath();

            inkManager.processPointerUp(point);
            renderAllStrokes();
        }
    }

    var penID = -1;

    var canvas = document.getElementById('inkCanvas');
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerout', handlePointerOut);

    var inputColor = document.getElementById('inputColor');
    inputColor.addEventListener('change', handleColorChange);

    var inkManager = new InkManager(canvas);
    inkManager.color = inputColor.value;
});
