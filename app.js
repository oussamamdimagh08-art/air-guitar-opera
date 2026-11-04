/* =========================================================
   AIR GUITAR OPERA
   Camera + MediaPipe + Web Audio
   Sound stops when the hand leaves the zone
   ========================================================= */


/* -------------------------
   DOM ELEMENTS
------------------------- */

const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");
const startStatus = document.getElementById("startStatus");

const experience = document.getElementById("experience");

const video = document.getElementById("cameraVideo");
const handCanvas = document.getElementById("handCanvas");
const effectsCanvas = document.getElementById("effectsCanvas");

const handContext = handCanvas.getContext("2d");
const effectsContext = effectsCanvas.getContext("2d");

const leftZoneElement = document.getElementById("leftZone");
const rightZoneElement = document.getElementById("rightZone");

const leftEnergyElement =
  document.querySelector("#leftEnergy i");

const rightEnergyElement =
  document.querySelector("#rightEnergy i");

const leftFrequencyElement =
  document.getElementById("leftFrequency");

const rightFrequencyElement =
  document.getElementById("rightFrequency");

const cameraStatusElement =
  document.getElementById("cameraStatus");

const handStatusElement =
  document.getElementById("handStatus");

const soundStatusElement =
  document.getElementById("soundStatus");

const mainMessageElement =
  document.getElementById("mainMessage");

const subMessageElement =
  document.getElementById("subMessage");

const masterVolumeInput =
  document.getElementById("masterVolume");

const volumeValueElement =
  document.getElementById("volumeValue");

const stopButton =
  document.getElementById("stopButton");

const restartButton =
  document.getElementById("restartButton");

const fullscreenButton =
  document.getElementById("fullscreenButton");

const errorMessageElement =
  document.getElementById("errorMessage");


/* -------------------------
   APPLICATION STATE
------------------------- */

let audioContext = null;
let masterGain = null;

let mediaPipeHands = null;
let camera = null;

let leftHandInside = false;
let rightHandInside = false;

let leftHandEnergy = 0;
let rightHandEnergy = 0;

let lastHandDetectedAt = 0;

let lastLeftPoint = null;
let lastRightPoint = null;

let animationFrameId = null;

const activeSounds = new Map();
const particles = [];


/* -------------------------
   CONFIGURATION
------------------------- */

const HAND_LOST_DELAY = 180;

const LEFT_ZONE = {
  xMin: 0.07,
  xMax: 0.37,
  yMin: 0.26,
  yMax: 0.80
};

const RIGHT_ZONE = {
  xMin: 0.63,
  xMax: 0.93,
  yMin: 0.26,
  yMax: 0.80
};


/* -------------------------
   AUDIO INITIALIZATION
------------------------- */

function initializeAudio() {
  if (audioContext) {
    return;
  }

  audioContext = new (
    window.AudioContext ||
    window.webkitAudioContext
  )();

  masterGain = audioContext.createGain();

  masterGain.gain.value =
    Number(masterVolumeInput.value);

  masterGain.connect(audioContext.destination);

  soundStatusElement.textContent =
    "SOUND: READY";
}


/* -------------------------
   SOUND CREATION
------------------------- */

function startZoneSound(
  zoneName,
  frequency,
  oscillatorType = "sine"
) {
  initializeAudio();

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  if (activeSounds.has(zoneName)) {
    updateZoneFrequency(zoneName, frequency);
    return;
  }

  const oscillator =
    audioContext.createOscillator();

  const gainNode =
    audioContext.createGain();

  const filterNode =
    audioContext.createBiquadFilter();

  oscillator.type = oscillatorType;
  oscillator.frequency.value = frequency;

  filterNode.type = "lowpass";
  filterNode.frequency.value = 1800;
  filterNode.Q.value = 1.5;

  gainNode.gain.setValueAtTime(
    0,
    audioContext.currentTime
  );

  gainNode.gain.linearRampToValueAtTime(
    0.28,
    audioContext.currentTime + 0.06
  );

  oscillator.connect(filterNode);
  filterNode.connect(gainNode);
  gainNode.connect(masterGain);

  oscillator.start();

  activeSounds.set(zoneName, {
    oscillator,
    gainNode,
    filterNode,
    frequency
  });

  soundStatusElement.textContent =
    "SOUND: PLAYING";
}


/* -------------------------
   UPDATE FREQUENCY
------------------------- */

function updateZoneFrequency(zoneName, frequency) {
  const sound = activeSounds.get(zoneName);

  if (!sound || !audioContext) {
    return;
  }

  const now = audioContext.currentTime;

  sound.oscillator.frequency.cancelScheduledValues(now);

  sound.oscillator.frequency.linearRampToValueAtTime(
    frequency,
    now + 0.08
  );

  sound.filterNode.frequency.linearRampToValueAtTime(
    Math.min(3200, frequency * 5),
    now + 0.08
  );

  sound.frequency = frequency;
}


/* -------------------------
   STOP ONE ZONE SOUND
------------------------- */

function stopZoneSound(zoneName) {
  const sound = activeSounds.get(zoneName);

  if (!sound || !audioContext) {
    return;
  }

  const now = audioContext.currentTime;

  sound.gainNode.gain.cancelScheduledValues(now);

  sound.gainNode.gain.setValueAtTime(
    Math.max(
      0.0001,
      sound.gainNode.gain.value
    ),
    now
  );

  sound.gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    now + 0.1
  );

  window.setTimeout(() => {
    try {
      sound.oscillator.stop();
    } catch (error) {
      console.warn(
        `${zoneName} oscillator already stopped`,
        error
      );
    }

    try {
      sound.oscillator.disconnect();
      sound.filterNode.disconnect();
      sound.gainNode.disconnect();
    } catch (error) {
      console.warn(
        `${zoneName} audio disconnection error`,
        error
      );
    }
  }, 130);

  activeSounds.delete(zoneName);

  if (activeSounds.size === 0) {
    soundStatusElement.textContent =
      "SOUND: SILENT";
  }
}


/* -------------------------
   STOP EVERYTHING
------------------------- */

function stopAllSounds() {
  const zoneNames =
    Array.from(activeSounds.keys());

  zoneNames.forEach(stopZoneSound);

  leftHandInside = false;
  rightHandInside = false;

  leftHandEnergy = 0;
  rightHandEnergy = 0;

  updateZoneInterface();
}


/* -------------------------
   FREQUENCY CALCULATION
------------------------- */

function calculateFrequency(
  normalizedY,
  minFrequency,
  maxFrequency
) {
  const clampedY = Math.max(
    0,
    Math.min(1, normalizedY)
  );

  const invertedY = 1 - clampedY;

  return (
    minFrequency +
    invertedY * (
      maxFrequency - minFrequency
    )
  );
}


/* -------------------------
   CANVAS SIZE
------------------------- */

function resizeCanvases() {
  const pixelRatio =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  [handCanvas, effectsCanvas].forEach((canvas) => {
    canvas.width =
      window.innerWidth * pixelRatio;

    canvas.height =
      window.innerHeight * pixelRatio;

    canvas.style.width =
      `${window.innerWidth}px`;

    canvas.style.height =
      `${window.innerHeight}px`;

    const context =
      canvas.getContext("2d");

    context.setTransform(
      pixelRatio,
      0,
      0,
      pixelRatio,
      0,
      0
    );
  });
}


/* -------------------------
   PARTICLES
------------------------- */

function createParticles(
  x,
  y,
  color,
  amount = 7
) {
  for (let index = 0; index < amount; index += 1) {
    particles.push({
      x,
      y,

      velocityX:
        (Math.random() - 0.5) * 4,

      velocityY:
        (Math.random() - 0.5) * 4,

      life: 1,

      size:
        Math.random() * 4 + 1,

      color
    });
  }

  if (particles.length > 500) {
    particles.splice(
      0,
      particles.length - 500
    );
  }
}


/* -------------------------
   PARTICLE ANIMATION
------------------------- */

function animateParticles() {
  effectsContext.fillStyle =
    "rgba(2, 4, 10, 0.13)";

  effectsContext.fillRect(
    0,
    0,
    window.innerWidth,
    window.innerHeight
  );

  for (const particle of particles) {
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;

    particle.velocityX *= 0.98;
    particle.velocityY *= 0.98;

    particle.life -= 0.018;

    effectsContext.globalAlpha =
      Math.max(0, particle.life);

    effectsContext.fillStyle =
      particle.color;

    effectsContext.shadowBlur = 14;
    effectsContext.shadowColor =
      particle.color;

    effectsContext.beginPath();

    effectsContext.arc(
      particle.x,
      particle.y,
      particle.size,
      0,
      Math.PI * 2
    );

    effectsContext.fill();
  }

  effectsContext.globalAlpha = 1;
  effectsContext.shadowBlur = 0;

  for (
    let index = particles.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (particles[index].life <= 0) {
      particles.splice(index, 1);
    }
  }

  animationFrameId =
    window.requestAnimationFrame(
      animateParticles
    );
}


/* -------------------------
   CHECK POINT IN ZONE
------------------------- */

function pointIsInsideZone(point, zone) {
  if (!point) {
    return false;
  }

  return (
    point.x >= zone.xMin &&
    point.x <= zone.xMax &&
    point.y >= zone.yMin &&
    point.y <= zone.yMax
  );
}


/* -------------------------
   LANDMARK COORDINATES
------------------------- */

function convertLandmarkToScreen(landmark) {
  return {
    /* Video is mirrored */
    x: 1 - landmark.x,
    y: landmark.y,

    screenX:
      (1 - landmark.x) *
      window.innerWidth,

    screenY:
      landmark.y *
      window.innerHeight
  };
}


/* -------------------------
   DRAW HAND LANDMARKS
------------------------- */

function drawDetectedHand(
  landmarks,
  color
) {
  const connections = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],

    [0, 5],
    [5, 6],
    [6, 7],
    [7, 8],

    [5, 9],
    [9, 10],
    [10, 11],
    [11, 12],

    [9, 13],
    [13, 14],
    [14, 15],
    [15, 16],

    [13, 17],
    [17, 18],
    [18, 19],
    [19, 20],

    [0, 17]
  ];

  handContext.save();

  handContext.strokeStyle = color;
  handContext.fillStyle = "#ffffff";

  handContext.lineWidth = 2;

  handContext.shadowBlur = 12;
  handContext.shadowColor = color;

  for (const [firstIndex, secondIndex] of connections) {
    const first =
      convertLandmarkToScreen(
        landmarks[firstIndex]
      );

    const second =
      convertLandmarkToScreen(
        landmarks[secondIndex]
      );

    handContext.beginPath();

    handContext.moveTo(
      first.screenX,
      first.screenY
    );

    handContext.lineTo(
      second.screenX,
      second.screenY
    );

    handContext.stroke();
  }

  for (const landmark of landmarks) {
    const point =
      convertLandmarkToScreen(landmark);

    handContext.beginPath();

    handContext.arc(
      point.screenX,
      point.screenY,
      4,
      0,
      Math.PI * 2
    );

    handContext.fill();
  }

  handContext.restore();
}


/* -------------------------
   PROCESS LEFT OR RIGHT HAND
------------------------- */

function processHand(
  landmarks,
  handLabel
) {
  /*
    Landmark 9 is near the center
    of the palm.
  */
  const palmPoint =
    convertLandmarkToScreen(
      landmarks[9]
    );

  if (handLabel === "Left") {
    lastLeftPoint = palmPoint;
  } else {
    lastRightPoint = palmPoint;
  }

  return palmPoint;
}


/* -------------------------
   UPDATE SOUNDS AND ZONES
------------------------- */

function updateHandZones(
  leftPoint,
  rightPoint
) {
  /*
    Because the camera image is mirrored,
    the visual left and right zones are
    based on the final screen coordinates.
  */

  const newLeftHandInside =
    pointIsInsideZone(
      leftPoint,
      LEFT_ZONE
    ) ||
    pointIsInsideZone(
      rightPoint,
      LEFT_ZONE
    );

  const newRightHandInside =
    pointIsInsideZone(
      rightPoint,
      RIGHT_ZONE
    ) ||
    pointIsInsideZone(
      leftPoint,
      RIGHT_ZONE
    );


  /* LEFT ZONE */

  if (newLeftHandInside) {
    const activePoint =
      pointIsInsideZone(
        leftPoint,
        LEFT_ZONE
      )
        ? leftPoint
        : rightPoint;

    const leftFrequency =
      calculateFrequency(
        activePoint.y,
        90,
        280
      );

    if (!leftHandInside) {
      startZoneSound(
        "left",
        leftFrequency,
        "sawtooth"
      );
    } else {
      updateZoneFrequency(
        "left",
        leftFrequency
      );
    }

    leftHandEnergy =
      Math.min(
        100,
        leftHandEnergy + 8
      );

    leftFrequencyElement.textContent =
      `${Math.round(leftFrequency)} Hz`;

    createParticles(
      activePoint.screenX,
      activePoint.screenY,
      "#61e8ff",
      3
    );
  } else {
    if (leftHandInside) {
      stopZoneSound("left");
    }

    leftHandEnergy =
      Math.max(
        0,
        leftHandEnergy - 12
      );

    leftFrequencyElement.textContent =
      "Waiting for hand";
  }


  /* RIGHT ZONE */

  if (newRightHandInside) {
    const activePoint =
      pointIsInsideZone(
        rightPoint,
        RIGHT_ZONE
      )
        ? rightPoint
        : leftPoint;

    const rightFrequency =
      calculateFrequency(
        activePoint.y,
        280,
        880
      );

    if (!rightHandInside) {
      startZoneSound(
        "right",
        rightFrequency,
        "triangle"
      );
    } else {
      updateZoneFrequency(
        "right",
        rightFrequency
      );
    }

    rightHandEnergy =
      Math.min(
        100,
        rightHandEnergy + 8
      );

    rightFrequencyElement.textContent =
      `${Math.round(rightFrequency)} Hz`;

    createParticles(
      activePoint.screenX,
      activePoint.screenY,
      "#ff4ea3",
      3
    );
  } else {
    if (rightHandInside) {
      stopZoneSound("right");
    }

    rightHandEnergy =
      Math.max(
        0,
        rightHandEnergy - 12
      );

    rightFrequencyElement.textContent =
      "Waiting for hand";
  }


  leftHandInside =
    newLeftHandInside;

  rightHandInside =
    newRightHandInside;

  updateZoneInterface();
}


/* -------------------------
   ZONE INTERFACE
------------------------- */

function updateZoneInterface() {
  leftZoneElement.classList.toggle(
    "active",
    leftHandInside
  );

  rightZoneElement.classList.toggle(
    "active",
    rightHandInside
  );

  leftEnergyElement.style.width =
    `${leftHandEnergy}%`;

  rightEnergyElement.style.width =
    `${rightHandEnergy}%`;

  if (leftHandInside && rightHandInside) {
    mainMessageElement.textContent =
      "Both hands are creating the opera";

    subMessageElement.textContent =
      "Move vertically to change both musical pitches";
  } else if (leftHandInside) {
    mainMessageElement.textContent =
      "Left-hand bass is active";

    subMessageElement.textContent =
      "Move the hand vertically to change the pitch";
  } else if (rightHandInside) {
    mainMessageElement.textContent =
      "Right-hand lead is active";

    subMessageElement.textContent =
      "Move the hand vertically to change the pitch";
  } else {
    mainMessageElement.textContent =
      "Place both hands inside the two zones";

    subMessageElement.textContent =
      "The sound stops when your hand leaves its zone";
  }
}


/* -------------------------
   MEDIAPIPE CALLBACK
------------------------- */

function onMediaPipeResults(results) {
  handContext.clearRect(
    0,
    0,
    window.innerWidth,
    window.innerHeight
  );

  const detectedHands =
    results.multiHandLandmarks || [];

  const handedness =
    results.multiHandedness || [];

  if (detectedHands.length === 0) {
    handStatusElement.textContent =
      "HANDS: NOT DETECTED";

    const timeWithoutHands =
      performance.now() -
      lastHandDetectedAt;

    /*
      Stop after a small tolerance.
      This prevents unstable sound cuts
      when one camera frame is missed.
    */
    if (
      timeWithoutHands >
      HAND_LOST_DELAY
    ) {
      lastLeftPoint = null;
      lastRightPoint = null;

      stopAllSounds();
    }

    return;
  }

  lastHandDetectedAt =
    performance.now();

  handStatusElement.textContent =
    `HANDS: ${detectedHands.length} DETECTED`;

  let currentLeftPoint = null;
  let currentRightPoint = null;

  detectedHands.forEach(
    (landmarks, index) => {
      const classification =
        handedness[index];

      const label =
        classification &&
        classification.label
          ? classification.label
          : index === 0
            ? "Left"
            : "Right";

      const color =
        label === "Left"
          ? "#61e8ff"
          : "#ff4ea3";

      drawDetectedHand(
        landmarks,
        color
      );

      const palmPoint =
        processHand(
          landmarks,
          label
        );

      if (label === "Left") {
        currentLeftPoint =
          palmPoint;
      } else {
        currentRightPoint =
          palmPoint;
      }
    }
  );

  updateHandZones(
    currentLeftPoint,
    currentRightPoint
  );
}


/* -------------------------
   INITIALIZE MEDIAPIPE
------------------------- */

function initializeMediaPipe() {
  if (typeof Hands === "undefined") {
    throw new Error(
      "MediaPipe Hands could not be loaded. Check the Internet connection."
    );
  }

  mediaPipeHands = new Hands({
    locateFile: (fileName) => {
      return (
        "https://cdn.jsdelivr.net/npm/" +
        "@mediapipe/hands/" +
        fileName
      );
    }
  });

  mediaPipeHands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,

    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.60,

    selfieMode: true
  });

  mediaPipeHands.onResults(
    onMediaPipeResults
  );
}


/* -------------------------
   START CAMERA
------------------------- */

async function startCamera() {
  startButton.disabled = true;

  startStatus.textContent =
    "Loading MediaPipe and requesting camera permission...";

  try {
    initializeAudio();
    initializeMediaPipe();

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error(
        "This browser does not support camera access."
      );
    }

    camera = new Camera(video, {
      onFrame: async () => {
        if (
          mediaPipeHands &&
          video.readyState >= 2
        ) {
          await mediaPipeHands.send({
            image: video
          });
        }
      },

      width: 1280,
      height: 720
    });

    await camera.start();

    startScreen.classList.add("hidden");
    experience.classList.remove("hidden");

    cameraStatusElement.textContent =
      "CAMERA: ACTIVE";

    handStatusElement.textContent =
      "HANDS: SEARCHING";

    resizeCanvases();

    if (!animationFrameId) {
      animateParticles();
    }
  } catch (error) {
    console.error(
      "Air Guitar Opera startup error:",
      error
    );

    startButton.disabled = false;

    startStatus.textContent =
      error.message ||
      "The camera could not be started.";

    showError(
      "Camera or MediaPipe error: " +
      (
        error.message ||
        "unknown error"
      )
    );
  }
}


/* -------------------------
   RESTART CAMERA
------------------------- */

async function restartCamera() {
  stopAllSounds();

  cameraStatusElement.textContent =
    "CAMERA: RESTARTING";

  if (camera) {
    try {
      await camera.stop();
    } catch (error) {
      console.warn(
        "Camera stop warning:",
        error
      );
    }
  }

  if (video.srcObject) {
    video.srcObject
      .getTracks()
      .forEach(
        (track) => track.stop()
      );

    video.srcObject = null;
  }

  try {
    camera = new Camera(video, {
      onFrame: async () => {
        if (
          mediaPipeHands &&
          video.readyState >= 2
        ) {
          await mediaPipeHands.send({
            image: video
          });
        }
      },

      width: 1280,
      height: 720
    });

    await camera.start();

    cameraStatusElement.textContent =
      "CAMERA: ACTIVE";
  } catch (error) {
    cameraStatusElement.textContent =
      "CAMERA: ERROR";

    showError(
      "Unable to restart the camera."
    );

    console.error(error);
  }
}


/* -------------------------
   ERROR MESSAGE
------------------------- */

function showError(message) {
  errorMessageElement.textContent =
    message;

  errorMessageElement.classList.remove(
    "hidden"
  );

  window.setTimeout(() => {
    errorMessageElement.classList.add(
      "hidden"
    );
  }, 6000);
}


/* -------------------------
   VOLUME CONTROL
------------------------- */

masterVolumeInput.addEventListener(
  "input",
  () => {
    const volume =
      Number(masterVolumeInput.value);

    volumeValueElement.textContent =
      `${Math.round(volume * 200)}%`;

    if (
      masterGain &&
      audioContext
    ) {
      masterGain.gain.linearRampToValueAtTime(
        volume,
        audioContext.currentTime + 0.05
      );
    }
  }
);


/* -------------------------
   BUTTON EVENTS
------------------------- */

startButton.addEventListener(
  "click",
  startCamera
);

stopButton.addEventListener(
  "click",
  stopAllSounds
);

restartButton.addEventListener(
  "click",
  restartCamera
);

fullscreenButton.addEventListener(
  "click",
  async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      showError(
        "Fullscreen mode is unavailable."
      );
    }
  }
);


/* -------------------------
   GLOBAL SAFETY EVENTS
------------------------- */

document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      stopAllSounds();
    }
  }
);

window.addEventListener(
  "blur",
  stopAllSounds
);

window.addEventListener(
  "beforeunload",
  stopAllSounds
);

window.addEventListener(
  "resize",
  resizeCanvases
);


/* -------------------------
   INITIAL UI
------------------------- */

updateZoneInterface();
resizeCanvases();
