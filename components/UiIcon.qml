pragma ComponentBehavior: Bound

import QtQuick
import "../config"

Item {
    id: root

    property string name: ""
    property color color: Theme.text
    property int size: 14
    property real strokeWidth: 1.5

    implicitWidth: size
    implicitHeight: size
    width: size
    height: size

    onNameChanged: canvas.requestPaint()
    onColorChanged: canvas.requestPaint()
    onSizeChanged: canvas.requestPaint()
    onStrokeWidthChanged: canvas.requestPaint()

    Canvas {
        id: canvas
        anchors.fill: parent
        antialiasing: true

        onPaint: {
            const ctx = getContext("2d");
            ctx.reset();
            if (!root.name || width <= 0 || height <= 0) return;

            const s = Math.min(width, height) / 16.0;
            ctx.scale(s, s);
            ctx.strokeStyle = root.color.toString();
            ctx.fillStyle = root.color.toString();
            ctx.lineWidth = root.strokeWidth / Math.max(0.75, s * 0.92);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            switch (root.name) {
            case "sanctuary":
                ctx.beginPath();
                ctx.arc(8, 8, 6.2, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(8, 8, 2.0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(1.9, 8);
                ctx.lineTo(6.0, 8);
                ctx.moveTo(10.0, 8);
                ctx.lineTo(14.1, 8);
                ctx.stroke();
                break;

            case "search":
                ctx.beginPath();
                ctx.arc(7.1, 7.1, 4.4, 0, Math.PI * 2);
                ctx.moveTo(10.4, 10.4);
                ctx.lineTo(13.8, 13.8);
                ctx.stroke();
                break;

            case "close":
                ctx.beginPath();
                ctx.moveTo(4.2, 4.2);
                ctx.lineTo(11.8, 11.8);
                ctx.moveTo(11.8, 4.2);
                ctx.lineTo(4.2, 11.8);
                ctx.stroke();
                break;

            case "plus":
                ctx.beginPath();
                ctx.moveTo(8, 3.3);
                ctx.lineTo(8, 12.7);
                ctx.moveTo(3.3, 8);
                ctx.lineTo(12.7, 8);
                ctx.stroke();
                break;

            case "minus":
                ctx.beginPath();
                ctx.moveTo(3.5, 8);
                ctx.lineTo(12.5, 8);
                ctx.stroke();
                break;

            case "check":
                ctx.beginPath();
                ctx.moveTo(3.0, 8.4);
                ctx.lineTo(6.4, 11.8);
                ctx.lineTo(13.0, 4.6);
                ctx.stroke();
                break;

            case "edit":
                ctx.beginPath();
                ctx.moveTo(10.8, 2.8);
                ctx.lineTo(13.2, 5.2);
                ctx.lineTo(5.6, 12.8);
                ctx.lineTo(2.8, 13.2);
                ctx.lineTo(3.2, 10.4);
                ctx.closePath();
                ctx.stroke();
                break;

            case "eye":
                ctx.beginPath();
                ctx.moveTo(1.6, 8);
                ctx.quadraticCurveTo(8, 2.4, 14.4, 8);
                ctx.quadraticCurveTo(8, 13.6, 1.6, 8);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(8, 8, 1.9, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case "eyeOff":
                ctx.beginPath();
                ctx.moveTo(1.6, 8);
                ctx.quadraticCurveTo(8, 2.6, 14.4, 8);
                ctx.quadraticCurveTo(8, 13.4, 1.6, 8);
                ctx.moveTo(2.6, 2.6);
                ctx.lineTo(13.4, 13.4);
                ctx.stroke();
                break;

            case "heart":
                ctx.beginPath();
                ctx.moveTo(8, 13.3);
                ctx.bezierCurveTo(2.0, 9.6, 1.8, 4.4, 5.1, 3.3);
                ctx.bezierCurveTo(6.7, 2.8, 7.6, 3.8, 8, 4.8);
                ctx.bezierCurveTo(8.4, 3.8, 9.3, 2.8, 10.9, 3.3);
                ctx.bezierCurveTo(14.2, 4.4, 14.0, 9.6, 8, 13.3);
                ctx.stroke();
                break;

            case "berry":
                ctx.beginPath();
                ctx.arc(8, 9.3, 4.3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(8, 5.0);
                ctx.quadraticCurveTo(8.2, 2.5, 11.4, 2.4);
                ctx.quadraticCurveTo(10.8, 4.8, 8, 5.0);
                ctx.stroke();
                break;

            case "spark":
                ctx.beginPath();
                ctx.moveTo(8, 2.0);
                ctx.quadraticCurveTo(8.4, 7.2, 14.0, 8);
                ctx.quadraticCurveTo(8.4, 8.8, 8, 14.0);
                ctx.quadraticCurveTo(7.6, 8.8, 2.0, 8);
                ctx.quadraticCurveTo(7.6, 7.2, 8, 2.0);
                ctx.closePath();
                ctx.stroke();
                break;

            case "target":
                ctx.beginPath();
                ctx.arc(8, 8, 4.8, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(8, 8, 1.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(8, 1.6);
                ctx.lineTo(8, 3.2);
                ctx.moveTo(8, 12.8);
                ctx.lineTo(8, 14.4);
                ctx.moveTo(1.6, 8);
                ctx.lineTo(3.2, 8);
                ctx.moveTo(12.8, 8);
                ctx.lineTo(14.4, 8);
                ctx.stroke();
                break;

            case "moon":
                ctx.beginPath();
                ctx.arc(8.6, 8, 5.2, 0.55 * Math.PI, 1.62 * Math.PI);
                ctx.quadraticCurveTo(6.6, 8.2, 11.6, 12.2);
                ctx.stroke();
                break;

            case "sun":
                ctx.beginPath();
                ctx.arc(8, 8, 3.1, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = (i * Math.PI) / 4;
                    ctx.moveTo(8 + Math.cos(a) * 4.8, 8 + Math.sin(a) * 4.8);
                    ctx.lineTo(8 + Math.cos(a) * 6.4, 8 + Math.sin(a) * 6.4);
                }
                ctx.stroke();
                break;

            case "music":
                ctx.beginPath();
                ctx.moveTo(6.2, 11.6);
                ctx.lineTo(6.2, 4.2);
                ctx.lineTo(12.8, 2.8);
                ctx.lineTo(12.8, 10.4);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(4.7, 11.8, 1.6, 0, Math.PI * 2);
                ctx.arc(11.3, 10.6, 1.6, 0, Math.PI * 2);
                ctx.fill();
                break;

            case "perch":
                ctx.beginPath();
                ctx.rect(2.4, 4.2, 11.2, 9.2);
                ctx.moveTo(2.4, 6.8);
                ctx.lineTo(13.6, 6.8);
                ctx.stroke();
                break;

            case "terminal":
                ctx.beginPath();
                ctx.moveTo(3.0, 5.0);
                ctx.lineTo(6.8, 8.2);
                ctx.lineTo(3.0, 11.4);
                ctx.moveTo(8.4, 11.6);
                ctx.lineTo(13.0, 11.6);
                ctx.stroke();
                break;

            case "compass":
                ctx.beginPath();
                ctx.arc(8, 8, 5.8, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(10.6, 5.4);
                ctx.lineTo(9.0, 9.0);
                ctx.lineTo(5.4, 10.6);
                ctx.lineTo(7.0, 7.0);
                ctx.closePath();
                ctx.stroke();
                break;

            case "leaf":
                ctx.beginPath();
                ctx.moveTo(3.2, 12.8);
                ctx.quadraticCurveTo(3.4, 4.2, 12.8, 3.2);
                ctx.quadraticCurveTo(12.2, 12.2, 3.2, 12.8);
                ctx.moveTo(3.2, 12.8);
                ctx.lineTo(9.4, 6.6);
                ctx.stroke();
                break;

            case "wind":
                ctx.beginPath();
                ctx.moveTo(2.2, 6.2);
                ctx.lineTo(10.8, 6.2);
                ctx.arc(10.8, 4.7, 1.5, 0.5 * Math.PI, 1.6 * Math.PI, true);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(2.2, 9.6);
                ctx.lineTo(12.4, 9.6);
                ctx.arc(12.4, 11.2, 1.6, 1.5 * Math.PI, 0.4 * Math.PI, false);
                ctx.stroke();
                break;

            case "dream":
                ctx.beginPath();
                ctx.arc(7.4, 8.8, 4.4, 0.45 * Math.PI, 1.58 * Math.PI);
                ctx.quadraticCurveTo(5.8, 9.0, 10.0, 12.2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(12.2, 3.0);
                ctx.lineTo(12.2, 6.0);
                ctx.moveTo(10.7, 4.5);
                ctx.lineTo(13.7, 4.5);
                ctx.stroke();
                break;

            case "sliders":
                ctx.beginPath();
                ctx.moveTo(2.4, 5.4);
                ctx.lineTo(13.6, 5.4);
                ctx.moveTo(2.4, 10.6);
                ctx.lineTo(13.6, 10.6);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(6.2, 5.4, 1.7, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(10.2, 10.6, 1.7, 0, Math.PI * 2);
                ctx.fill();
                break;

            case "arrowLeft":
                ctx.beginPath();
                ctx.moveTo(13.0, 8);
                ctx.lineTo(3.4, 8);
                ctx.moveTo(7.2, 4.2);
                ctx.lineTo(3.4, 8);
                ctx.lineTo(7.2, 11.8);
                ctx.stroke();
                break;

            case "chevronDown":
                ctx.beginPath();
                ctx.moveTo(4.0, 6.2);
                ctx.lineTo(8.0, 10.2);
                ctx.lineTo(12.0, 6.2);
                ctx.stroke();
                break;

            case "chevronRight":
                ctx.beginPath();
                ctx.moveTo(6.2, 4.0);
                ctx.lineTo(10.2, 8.0);
                ctx.lineTo(6.2, 12.0);
                ctx.stroke();
                break;
            }
        }
    }
}
