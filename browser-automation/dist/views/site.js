// Please see documentation at https://learn.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

// Write your JavaScript code.
"use strict"

function createBufferedStream(options) {
    options = options || {};
    let ready = false;

    var mediaSource = new MediaSource();
    var sourceBuffer;
    mediaSource.addEventListener('sourceopen', () => {
        // Create a new SourceBuffer
        sourceBuffer = mediaSource.addSourceBuffer(options.codec ?? 'video/webm; codecs="vp8"');


        // When the SourceBuffer has enough data to start playing
        sourceBuffer.addEventListener('updateend', () => {
            // If the video element is not already playing, start playing it
            if (!ready) {
                ready = true;
                options.onStart?.();
            }
            else {
                options.onUpdate?.();
            }
        });

        sourceBuffer.addEventListener('error', (event) => {
            throw new Error('SourceBuffer error:' + event);
        });
    });

    mediaSource.addEventListener('sourceended', () => {
        options.onEnded?.();
    });


    // attr: https://stackoverflow.com/a/21797381
    function base64ToArrayBuffer(base64) {
        var binaryString = atob(base64);
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }


    // Appends data to the stream
    const append = (b64Data) => {
        // Check if the MediaSource is still open
        if (mediaSource.readyState === 'open' && sourceBuffer) {
            //const byteArrays = b64toByteArrays(b64Data);
            //byteArrays.forEach(arrayU8 => {
            //    sourceBuffer.appendBuffer(arrayU8);
            //})
            sourceBuffer.appendBuffer(base64ToArrayBuffer(b64Data));
        } else {
            throw new Error('Media source is not in open state: ' + mediaSource.readyState);
        }
    };

    const end = () => mediaSource.endOfStream();
    const createURL = () => URL.createObjectURL(mediaSource);

    return {
        append,
        end,
        createURL,
        get ready() { return ready },
    }
}

const globalProgressBar = document.getElementById("global-progress-bar")
function showProgress(){
    globalProgressBar.classList.remove('d-none')
}
function hideProgress(){
    globalProgressBar.classList.add('d-none')
}