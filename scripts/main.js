import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let xrSession = null;
let gl = null;
let xrRefSpace = null;
let track = null;
let reticle = null;
document.addEventListener('DOMContentLoaded', () => {
    const xrButton = document.getElementById('xr-button');
    xrButton.addEventListener('click', onButtonClicked);
});

function onButtonClicked() {
    if (!xrSession) {
        if (!navigator.xr) {
            console.log('WebXR not supported on this browser.');
            return;
        }
        navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
            if (supported) {
                navigator.xr.requestSession("immersive-ar", {
                    requiredFeatures: ['local', 'hit-test']}).then(async (session) => {
                    xrSession = session;
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
                    const videoTracks = stream.getVideoTracks();
                    track = videoTracks[0];
                    document.getElementById('viewer-camera').srcObject = stream;
                    onSessionStarted();
                });
            }
        });
    } else {
        xrSession.end().then(() => {
            xrSession = null;
            document.getElementById('xr-button').innerText = "Enter XR";
        });
    }
}

async function onSessionStarted() {
    try {
        xrSession.addEventListener('end', onSessionEnded);
        xrSession.addEventListener('select', onSelect);

        const canvas = document.createElement("canvas");
        document.body.appendChild(canvas);
        gl = canvas.getContext("webgl2", { xrCompatible: true });
        if (!gl) {
            console.error("WebGL 2 is not supported. Please ensure your browser and device support it.");
            return;
        } else {
            console.log("WebGL 2 is supported");
        }

        const scene = new THREE.Scene();
        const materials = [
            new THREE.MeshBasicMaterial({ color: 0xff0000 }),
            new THREE.MeshBasicMaterial({ color: 0x0000ff }),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
            new THREE.MeshBasicMaterial({ color: 0xff00ff }),
            new THREE.MeshBasicMaterial({ color: 0x00ffff }),
            new THREE.MeshBasicMaterial({ color: 0xffff00 })
        ];
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), materials);
        cube.position.set(0, 0, -1);
        scene.add(cube);

        const video = document.getElementById('viewer-camera');
        const background_texture = new THREE.VideoTexture(video);
        scene.background = background_texture;

        const renderer = new THREE.WebGLRenderer({
            alpha: true,
            preserveDrawingBuffer: true,
            canvas: canvas,
            context: gl
        });
        renderer.autoClear = false;

        const camera = new THREE.PerspectiveCamera();
        camera.matrixAutoUpdate = false;

        xrSession.updateRenderState({
            baseLayer: new XRWebGLLayer(xrSession, gl)
        });

        xrRefSpace = await xrSession.requestReferenceSpace('local');

        // Create reticle for placing objects
        const reticleGeometry = new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2);
        const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
        reticle.visible = false;
        scene.add(reticle);

        const onXRFrame = (time, frame) => {
            xrSession.requestAnimationFrame(onXRFrame);

            gl.bindFramebuffer(gl.FRAMEBUFFER, xrSession.renderState.baseLayer.framebuffer);
            const pose = frame.getViewerPose(xrRefSpace);

            if (pose) {
                const view = pose.views[0];
                const viewport = xrSession.renderState.baseLayer.getViewport(view);
                renderer.setSize(viewport.width, viewport.height);

                camera.matrix.fromArray(view.transform.matrix);
                camera.projectionMatrix.fromArray(view.projectionMatrix);
                camera.updateMatrixWorld(true);

                const hitTestResults = frame.getHitTestResults ? frame.getHitTestResults(xrRefSpace) : [];
                if (hitTestResults.length > 0) {
                    const hitPose = hitTestResults[0].getPose(xrRefSpace);
                    reticle.visible = true;
                    reticle.position.set(hitPose.transform.position.x, hitPose.transform.position.y, hitPose.transform.position.z);
                    reticle.updateMatrixWorld(true);
                } else {
                    reticle.visible = false;
                }

                renderer.render(scene, camera);
            }
        };

        xrSession.requestAnimationFrame(onXRFrame);
        document.getElementById('xr-button').innerText = "Exit XR";

    } catch (err) {
        console.error('Error while trying to activate AR session:', err);
    }
}

function onSelect() {
    if (reticle.visible) {
        addARObjectAt(reticle.matrix);
    }
}

function addARObjectAt(matrix) {
    const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), cubeMaterial);
    cube.applyMatrix4(matrix);
    scene.add(cube);
}

async function onSessionEnded() {
    xrSession = null;
    document.getElementById('xr-button').innerText = "Start XR";
    track.stop();
}
