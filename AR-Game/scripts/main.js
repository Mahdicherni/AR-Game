
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Text } from 'troika-three-text';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { init } from './init.js';
import { gsap } from "gsap";

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
        navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported) {
                navigator.xr.requestSession("immersive-vr", {
                    optionalFeatures: ['bounded-floor', 'layers']}).then(async (session) => {
                    xrSession = session;
                    //const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
                    //const videoTracks = stream.getVideoTracks();
                    //track = videoTracks[0];
                    //document.getElementById('viewer-camera').srcObject = stream;
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
        // Initialize virtual controller states
        const virtualController = {
            buttonPresses: {
                trigger: false,  // For Spacebar or any key you'd like to use
            },
        };

        // Handle keyboard input for virtual controller
        document.addEventListener('keydown', (event) => {
            if (event.key === ' ') {  // Spacebar to simulate trigger press
                virtualController.buttonPresses.trigger = true;
            }
        });

        document.addEventListener('keyup', (event) => {
            if (event.key === ' ') {  // Spacebar release
                virtualController.buttonPresses.trigger = false;
            }
        });
        const bullets = {};
        const forwardVector = new THREE.Vector3(0, 0, -1);
        const bulletSpeed = 10;
        const bulletTimeToLive = 1;
        
        const blasterGroup = new THREE.Group();
        const targets = [];
        
        let score = 0;
        const scoreText = new Text();
        scoreText.fontSize = 0.52;
        scoreText.font = "..\\assets\\SpaceMono-Bold.ttf";
        scoreText.position.z = -2;
        scoreText.color = 0xffa276;
        scoreText.anchorX = 'center';
        scoreText.anchorY = 'middle';
        
        let laserSound, scoreSound;
        
        function updateScoreDisplay() {
            const clampedScore = Math.max(0, Math.min(9999, score));
            const displayScore = clampedScore.toString().padStart(4, '0');
            scoreText.text = displayScore;
            scoreText.sync();
        }
        let controllers = {
            right: null,
            left: null,
        };

        
        function setupScene({ scene, camera, renderer, player, controllers }) {
            const gltfLoader = new GLTFLoader();
        
            gltfLoader.load("..\\assets\\spacestation.glb", (gltf) => {
                scene.add(gltf.scene);
            });
        
            gltfLoader.load("..\\assets\\blaster.glb", (gltf) => {
                blasterGroup.add(gltf.scene);
            });
        
            gltfLoader.load("..\\assets\\target.glb", (gltf) => {
                for (let i = 0; i < 3; i++) {
                    const target = gltf.scene.clone();
                    target.position.set(
                        Math.random() * 10 - 5,
                        i * 2 + 1,
                        -Math.random() * 5 - 5,
                    );
                    scene.add(target);
                    targets.push(target);
                }
            });
        
            scene.add(scoreText);
            scoreText.position.set(0, 0.67, -1.44);
            scoreText.rotateX(-Math.PI / 3.3);
            updateScoreDisplay();
        
            // Load and set up positional audio
            const listener = new THREE.AudioListener();
            camera.add(listener);
        
            const audioLoader = new THREE.AudioLoader();
            laserSound = new THREE.PositionalAudio(listener);
            audioLoader.load("..\\assets\\laser.ogg", (buffer) => {
                laserSound.setBuffer(buffer);
                blasterGroup.add(laserSound);
            });
        
            scoreSound = new THREE.PositionalAudio(listener);
            audioLoader.load("..\\assets\\score.ogg", (buffer) => {
                scoreSound.setBuffer(buffer);
                scoreText.add(scoreSound);
            });
        }
        window.addEventListener('keydown', (event) => {
            if (event.code === 'Space') {
                console.log("Fire bullet!");
            }
        });
        
        function onFrame(
            delta,
            time,
            { scene, camera, renderer, player, controllers },
        ) {
            if (controllers.right) {
                const { gamepad, raySpace, mesh } = controllers.right;
                if (!raySpace.children.includes(blasterGroup)) {
                    raySpace.add(blasterGroup);
                    mesh.visible = false;
                }
                if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
                    try {
                        gamepad.getHapticActuator(0).pulse(0.6, 100);
                    } catch {
                        // do nothing
                    }
        
                    // Play laser sound
                    if (laserSound.isPlaying) laserSound.stop();
                    laserSound.play();
        
                    const bulletPrototype = blasterGroup.getObjectByName('bullet');
                    if (bulletPrototype) {
                        const bullet = bulletPrototype.clone();
                        scene.add(bullet);
                        bulletPrototype.getWorldPosition(bullet.position);
                        bulletPrototype.getWorldQuaternion(bullet.quaternion);
        
                        const directionVector = forwardVector
                            .clone()
                            .applyQuaternion(bullet.quaternion);
                        bullet.userData = {
                            velocity: directionVector.multiplyScalar(bulletSpeed),
                            timeToLive: bulletTimeToLive,
                        };
                        bullets[bullet.uuid] = bullet;
                    }
                }
            }
        



            Object.values(bullets).forEach((bullet) => {
                if (bullet.userData.timeToLive < 0) {
                    delete bullets[bullet.uuid];
                    scene.remove(bullet);
                    return;
                }
                const deltaVec = bullet.userData.velocity.clone().multiplyScalar(delta);
                bullet.position.add(deltaVec);
                bullet.userData.timeToLive -= delta;
        
                targets
                    .filter((target) => target.visible)
                    .forEach((target) => {
                        const distance = target.position.distanceTo(bullet.position);
                        if (distance < 1) {
                            delete bullets[bullet.uuid];
                            scene.remove(bullet);
        
                            gsap.to(target.scale, {
                                duration: 0.3,
                                x: 0,
                                y: 0,
                                z: 0,
                                onComplete: () => {
                                    target.visible = false;
                                    setTimeout(() => {
                                        target.visible = true;
                                        target.position.x = Math.random() * 10 - 5;
                                        target.position.z = -Math.random() * 5 - 5;
        
                                        // Scale back up the target
                                        gsap.to(target.scale, {
                                            duration: 0.3,
                                            x: 1,
                                            y: 1,
                                            z: 1,
                                        });
                                    }, 1000);
                                },
                            });
        
                            score += 10;
                            updateScoreDisplay();
                            if (scoreSound.isPlaying) scoreSound.stop();
                            scoreSound.play();
                        }
                    });
            });
            gsap.ticker.tick(delta);
        }
        init(setupScene, onFrame);;

        //xrSession.requestAnimationFrame(onFrame);
        //document.getElementById('xr-button').innerText = "Exit XR";

    } catch (err) {
        console.error('Error while trying to activate AR session:', err);
    }
}

function onSelect() {
    if (reticle.visible) {
        addARObjectAt(reticle.matrix);
    }
}


async function onSessionEnded() {
    xrSession = null;
    document.getElementById('xr-button').innerText = "Start XR";
    track.stop();
}
