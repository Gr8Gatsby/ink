// ink.js
// This file contains the code to interact with the Windows Runtime Inking APIs

var inkManager = new Windows.UI.Input.Inking.InkManager();
var drawingAttributes = new Windows.UI.Input.Inking.InkDrawingAttributes();
var penID = -1;

// Make the ink look nice after it is rendered
drawingAttributes.fitToCurve = true;
inkManager.setDefaultDrawingAttributes(drawingAttributes);

// Create a global object for managing canvases
var ink = {
    draw:{
        canvas: null,
        context: null
    },
    select: { //TODO: implement the Selection Canvas
        canvas: null,
        context: null
    }
};

// Which mode are we in? drawing ink, or selecting ink
var canvas;

// helper functions
function inRect(x, y, rect) {
    return ((rect.x <= x) && (x < (rect.x + rect.width)) &&
            (rect.y <= y) && (y < (rect.y + rect.height)));
}

// Set defaults
function setDefaults() {
    var strokeSize = drawingAttributes.size;
    strokeSize.width = strokeSize.height = context.lineWidth;
    drawingAttributes.size = strokeSize;
    drawingAttributes.color = Windows.UI.Colors.black;
    //drawingAttributes.drawAsHighlighter = context === hlContext;
    inkManager.setDefaultDrawingAttributes(drawingAttributes);
}

// Set application to ink mode
function inkMode() {
    //clearMode();
    context = ink.draw.context;
    inkManager.mode = Windows.UI.Input.Inking.InkManipulationMode.inking;
    setDefaults();
    //ink.draw.cavas.style.cursor = "default";
}

// Test the array of results bounding boxes
// Draws a single stroke into a specified canvas 2D context, with a specified color and width.
function renderStroke(stroke, color, width, ctx) {

    ctx.save();               // 
    ctx.beginPath();          //
    ctx.strokeStyle = color;  //
    ctx.lineWidth = width;    //

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
}// Tests the array of results bounding box

function renderAllStrokes() {

    // Clear the last context
    ink.draw.context.clearRect(0, 0, inkCanvas.width, inkCanvas.height);

    // Get all the strokes from the InkManager
    inkManager.getStrokes().forEach(function (stroke) {
        var att = stroke.drawingAttributes;
        var color = stroke.drawingAttributes.color;
        var strokeSize = att.size;
        var width = strokeSize.width;
        var hl = stroke.drawingAttributes.drawAsHighlighter;
        var ctx = ink.draw.context;
        if (stroke.selected) {
            renderStroke(stroke, color, width * 2, ctx);
            var stripe = hl ? "Azure" : "White";
            var w = width - (hl ? 3 : 1);
            renderStroke(stroke, stripe, w, ctx);
        } else {
            renderStroke(stroke, color, width, ctx);
        }
    });
}

// Handle Pointer events
// We will accept pen down or mouse left down as the start of a stroke.
// We will accept touch down or mouse right down as the start of a touch.
function handlePointerDown(evt) {
    if ((evt.pointerType === "pen") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
        
        var pt = { x: 0.0, y: 0.0 };
        inkManager.selectWithLine(pt, pt);
        pt = evt.currentPoint;

        /*
        if (pt.properties.isEraser) { // The back side of a pen, which we treat as an eraser
            tempEraseMode();
        } else {
            restoreMode();
        }
        */

        context.beginPath();
        context.moveTo(pt.rawPosition.x, pt.rawPosition.y);

        inkManager.processPointerDown(pt);
        penID = evt.pointerId;

    } else if (evt.pointerType === "touch") {
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

    // No need to process touch events - ink.draw.cavas.gestureObject takes care of them and triggers MSGesture* events.
}

function handlePointerUp(evt) {
    if (evt.pointerId === penID) {
        penID = -1;
        var pt = evt.currentPoint;
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

// Setup the application
document.addEventListener("DOMContentLoaded", function () {

    // Initialize the drawing canvas
    ink.draw.canvas = document.getElementById("inkCanvas");
    ink.draw.canvas.setAttribute("width", inkCanvas.offsetWidth);
    ink.draw.canvas.setAttribute("height", inkCanvas.offsetHeight);
    ink.draw.canvas.gestureObject = new MSGesture();
    ink.draw.canvas.gestureObject.target = ink.draw.canvas;

    ink.draw.context = ink.draw.canvas.getContext("2d");
    ink.draw.context.lineWidth = 5;
    ink.draw.context.strokeStyle = "#cacaca";
    ink.draw.context.lineCap = "round";
    ink.draw.context.lineJoin = "round";
    
    // Listen for pointer events
    ink.draw.canvas.addEventListener("pointerdown", handlePointerDown, false);
    ink.draw.canvas.addEventListener("pointerup", handlePointerUp, false);
    ink.draw.canvas.addEventListener("pointermove", handlePointerMove, false);
    ink.draw.canvas.addEventListener("pointerout", handlePointerOut, false);

    inkMode();
});