// Helper function to support HTML hexColor Strings
function hexStrToRGBA(hexStr) {
    // RGBA color object
    var colorObject = { r: 255, g: 255, b: 255, a: 255 };

    // remove hash if it exists
    hexStr = hexStr.replace('#', '');

    if (hexStr.length === 6) {
        // No Alpha
        colorObject.r = parseInt(hexStr.slice(0, 2), 16);
        colorObject.g = parseInt(hexStr.slice(2, 4), 16);
        colorObject.b = parseInt(hexStr.slice(4, 6), 16);
        colorObject.a = parseInt('0xFF', 16);
    } else if (hexStr.length === 8) {
        // Alpha
        colorObject.r = parseInt(hexStr.slice(0, 2), 16);
        colorObject.g = parseInt(hexStr.slice(2, 4), 16);
        colorObject.b = parseInt(hexStr.slice(4, 6), 16);
        colorObject.a = parseInt(hexStr.slice(6, 8), 16);
    } else if (hexStr.length === 3) {
        // Shorthand hex color
        var rVal = hexStr.slice(0, 1);
        var gVal = hexStr.slice(1, 2);
        var bVal = hexStr.slice(2, 3);
        colorObject.r = parseInt(rVal + rVal, 16);
        colorObject.g = parseInt(gVal + gVal, 16);
        colorObject.b = parseInt(bVal + bVal, 16);
    } else {
        throw new Error('Invalid HexString length. Expected either 8, 6, or 3. The actual length was ' + hexStr.length);
    }
    return colorObject;
}
