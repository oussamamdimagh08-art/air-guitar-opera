/* =========================================================
   AIR GUITAR OPERA
   Created by Oussama Mdemagh

   MediaPipe Hands + Web Audio API
   Left hand  = chord selection
   Right hand = guitar performance

   The sound automatically stops when the hand leaves
   the corresponding detection zone.
   ========================================================= */


/* =========================================================
   DOM ELEMENTS
========================================================= */

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

const leftNoteElement =
  document.getElementById("leftNote");

const rightNoteElement =
  document.getElementById("rightNote");

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


/* =========================================================
   APPLICATION STATE
========================================================= */

let audioContext = null;
let masterGainNode = null;
let reverbNode = null;

let mediaPipeHands = null;
let camera = null;

let leftHandInside = false;
let rightHandInside = false;

let leftHandEnergy = 0;
let rightHandEnergy = 0;

let lastHandDetectedAt = 0;

let lastRightHandPosition = null;
let lastRightHandTime = 0;

let lastStrumAt = 0;
let lastPlayedString = -1;

let selectedChordIndex = 0;

let animationFrameId = null;

const activeSources = new Set();
const particles = [];


/* =========================================================
   CONFIGURATION
========================================================= */

const HAND_LOST_DELAY = 180;

/*
  Small left-hand zone.
  Used only to choose a chord.
*/

const LEFT_ZONE = {
  xMin: 0.05,
  xMax: 0.22,
  yMin: 0.35,
  yMax: 0.75
};

/*
  Large right-hand performance zone.
*/

const RIGHT_ZONE = {
  xMin: 0.47,
  xMax: 0.94,
  yMin: 0.23,
  yMax: 0.83
};

const STRUM_MINIMUM_SPEED = 0.32;
const STRUM_COOLDOWN = 115;


/* =========================================================
   MUSICAL DATA
========================================================= */

const NOTE_FREQUENCIES = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.00,
  A3: 220.00,
  B3: 246.94,

  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.00,
  A4: 440.00,
  B4: 493.88,

  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99
};

const CHORDS = [
  {
    name: "C MAJOR",
    shortName: "C",
    notes: ["C3", "E3", "G3", "C4", "E4"]
  },
  {
    name: "A MINOR",
    shortName: "Am",
    notes: ["A3", "C4", "E4", "A4", "C5"]
  },
  {
    name: "F MAJOR",
    shortName: "F",
    notes: ["F3", "A3", "C4", "F4", "A4"]
  },
  {
    name: "G MAJOR",
    shortName: "G",
    notes: ["G3", "B3", "D4", "G4", "B4"]
  }
];


/* =========================================================
   AUDIO INITIALIZATION
========================================================= */

function initializeAudio() {
  if (audioContext) {
    return;
  }

  audioContext = new (
    window.AudioContext ||
    window.webkitAudioContext
  )();

  masterGainNode =
    audioContext.createGain();

  masterGainNode.gain.value =
    Number(masterVolumeInput.value);

  /*
    A short convolution reverb makes the sound warmer
    and more similar to an instrument in a room.
  */

  reverbNode =
    audioContext.createConvolver();

  reverbNode.buffer =
    createReverbImpulse(
      audioContext,
      1.6,
      2.7
    );

  const dryGain =
    audioContext.createGain();

  const wetGain =
    audioContext.createGain();

  dryGain.gain.value = 0.88;
  wetGain.gain.value = 0.22;

  dryGain.connect(masterGainNode);
  reverbNode.connect(wetGain);
  wetGain.connect(masterGainNode);

  masterGainNode.connect(
    audioContext.destination
  );

  /*
    Store these nodes so every guitar string can connect
    to both the dry and reverberated outputs.
  */

  audioContext.guitarDryGain = dryGain;
  audioContext.guitarReverb = reverbNode;

  soundStatusElement.textContent =
    "SOUND: READY";
}


/* =========================================================
   REVERB IMPULSE
========================================================= */

function createReverbImpulse(
  context,
  duration,
  decay
) {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;

  const impulse =
    context.createBuffer(
      2,
      length,
      sampleRate
    );

  for (
    let channel = 0;
    channel < impulse.numberOfChannels;
    channel += 1
  ) {
    const data =
      impulse.getChannelData(channel);

    for (
      let index = 0;
      index < length;
      index += 1
    ) {
      data[index] =
        (Math.random() * 2 - 1) *
        Math.pow(
          1 - index / length,
          decay
        );
    }
  }

  return impulse;
}


/* =========================================================
   GUITAR STRING SYNTHESIS

   Karplus-Strong style plucked-string synthesis.
   Produces a much more natural sound than a basic oscillator.
========================================================= */

function playGuitarString(
  noteName,
  intensity = 0.65,
  delay = 0
) {
  initializeAudio();

  const frequency =
    NOTE_FREQUENCIES[noteName];

  if (!frequency) {
    return;
  }

  if (
    audioContext.state === "suspended"
  ) {
    audioContext.resume();
  }

  const startTime =
    audioContext.currentTime + delay;

  const duration = 2.4;

  const frameCount =
    Math.floor(
      audioContext.sampleRate * duration
    );

  const buffer =
    audioContext.createBuffer(
      1,
      frameCount,
      audioContext.sampleRate
    );

  const data =
    buffer.getChannelData(0);

  /*
    Short random-noise excitation simulates the initial
    attack produced when a guitar string is plucked.
  */

  const period =
    Math.max(
      2,
      Math.floor(
        audioContext.sampleRate /
        frequency
      )
    );

  for (
    let index = 0;
    index < period;
    index += 1
  ) {
    data[index] =
      (Math.random() * 2 - 1) *
      intensity;
  }

  /*
    Feedback averaging creates the decaying vibration
    of a plucked string.
  */

  const damping =
    0.993 -
    Math.min(
      0.01,
      frequency / 100000
    );

  for (
    let index = period;
    index < frameCount;
    index += 1
  ) {
    const firstPrevious =
      data[index - period];

    const secondPrevious =
      data[
        Math.max(
          0,
          index - period + 1
        )
      ];

    data[index] =
      (
        firstPrevious +
        secondPrevious
      ) *
      0.5 *
      damping;
  }

  const source =
    audioContext.createBufferSource();

  const gainNode =
    audioContext.createGain();

  const bodyFilter =
    audioContext.createBiquadFilter();

  const brightnessFilter =
    audioContext.createBiquadFilter();

  source.buffer = buffer;

  bodyFilter.type = "peaking";
  bodyFilter.frequency.value = 230;
  bodyFilter.Q.value = 1.2;
  bodyFilter.gain.value = 4;

  brightnessFilter.type = "lowpass";

  brightnessFilter.frequency.value =
    1700 +
    intensity * 2800;

  brightnessFilter.Q.value = 0.8;

  gainNode.gain.setValueAtTime(
    0.0001,
    startTime
  );

  gainNode.gain.exponentialRampToValueAtTime(
    0.22 + intensity * 0.25,
    startTime + 0.012
  );

  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    startTime + duration
  );

  source.connect(bodyFilter);
  bodyFilter.connect(brightnessFilter);
  brightnessFilter.connect(gainNode);

  gainNode.connect(
    audioContext.guitarDryGain
  );

  gainNode.connect(
    audioContext.guitarReverb
  );

  source.start(startTime);
  source.stop(startTime + duration);

  activeSources.add(source);

  source.addEventListener(
    "ended",
    () => {
      activeSources.delete(source);

      try {
        source.disconnect();
        bodyFilter.disconnect();
        brightnessFilter.disconnect();
        gainNode.disconnect();
      } catch (error) {
        console.warn(
          "Audio cleanup warning:",
          error
        );
      }
    }
  );
}


/* =========================================================
   PLAY THE SELECTED CHORD
========================================================= */

function playSelectedChord(
  movementSpeed = 0.7,
  direction = "down"
) {
  const chord =
    CHORDS[selectedChordIndex];

  const notes =
    direction === "up"
      ? [...chord.notes].reverse()
      : chord.notes;

  const intensity =
    Math.max(
      0.35,
      Math.min(1, movementSpeed)
    );

  /*
    Small delays between the strings create a real
    guitar-strumming effect.
  */

  const stringDelay =
    0.022 +
    (1 - intensity) * 0.018;

  notes.forEach(
    (noteName, index) => {
      playGuitarString(
        noteName,
        intensity,
        index * stringDelay
      );
    }
  );

  soundStatusElement.textContent =
    `SOUND: ${chord.shortName} STRUM`;

  createStrumParticles(
    direction,
    intensity
  );
}


/* =========================================================
   PLAY ONE MELODIC NOTE
========================================================= */

function playMelodicNote(
  normalizedY,
  intensity
) {
  const melodyNotes = [
    "C3",
    "D3",
    "E3",
    "G3",
    "A3",
    "C4",
    "D4",
    "E4",
    "G4",
    "A4",
    "C5",
    "E5"
  ];

  const safeY =
    Math.max(
      0,
      Math.min(0.999, normalizedY)
    );

  const index =
    Math.floor(
      (1 - safeY) *
      melodyNotes.length
    );

  const selectedNote =
    melodyNotes[
      Math.min(
        index,
        melodyNotes.length - 1
      )
    ];

  playGuitarString(
    selectedNote,
    intensity,
    0
  );

  rightFrequencyElement.textContent =
    `Note: ${selectedNote}`;

  soundStatusElement.textContent =
    `SOUND: ${selectedNote}`;
}


/* =========================================================
   STOP ALL GUITAR SOUNDS
========================================================= */

function stopAllSounds() {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch (error) {
      console.warn(
        "Audio source already stopped",
        error
      );
    }
  }

  activeSources.clear();

  leftHandInside = false;
  rightHandInside = false;

  leftHandEnergy = 0;
  rightHandEnergy = 0;

  lastRightHandPosition = null;
  lastRightHandTime = 0;

  leftFrequencyElement.textContent =
    CHORDS[selectedChordIndex].name;

  rightFrequencyElement.textContent =
    "Move to play";

  soundStatusElement.textContent =
    "SOUND: SILENT";

  updateZoneInterface();
}


/* =========================================================
   LEFT HAND CHORD SELECTION
========================================================= */

function chooseChordFromLeftHand(point) {
  if (!point) {
    return;
  }

  const relativeY =
    (
      point.y -
      LEFT_ZONE.yMin
    ) /
    (
      LEFT_ZONE.yMax -
      LEFT_ZONE.yMin
    );

  const safeY =
    Math.max(
      0,
      Math.min(0.999, relativeY)
    );

  const nextIndex =
    Math.floor(
      safeY * CHORDS.length
    );

  if (
    nextIndex !== selectedChordIndex
  ) {
    selectedChordIndex =
      nextIndex;

    const chord =
      CHORDS[selectedChordIndex];

    leftFrequencyElement.textContent =
      chord.name;

    leftNoteElement.textContent =
      chord.shortName;

    /*
      A short preview note confirms the selected chord.
    */

    playGuitarString(
      chord.notes[0],
      0.38,
      0
    );

    createParticles(
      point.screenX,
      point.screenY,
      "#61e8ff",
      12
    );
  }
}


/* =========================================================
   RIGHT HAND PERFORMANCE
========================================================= */

function processRightHandMusic(point) {
  if (!point) {
    lastRightHandPosition = null;
    lastRightHandTime = 0;
    return;
  }

  const now = performance.now();

  if (
    !lastRightHandPosition ||
    !lastRightHandTime
  ) {
    lastRightHandPosition = {
      x: point.x,
      y: point.y
    };

    lastRightHandTime = now;
    return;
  }

  const deltaX =
    point.x -
    lastRightHandPosition.x;

  const deltaY =
    point.y -
    lastRightHandPosition.y;

  const distance =
    Math.hypot(deltaX, deltaY);

  const elapsed =
    Math.max(
      16,
      now - lastRightHandTime
    );

  const speed =
    distance / elapsed * 1000;

  const direction =
    deltaY > 0
      ? "down"
      : "up";

  /*
    Fast movements produce chord strums.
  */

  if (
    speed >= STRUM_MINIMUM_SPEED &&
    now - lastStrumAt >= STRUM_COOLDOWN
  ) {
    const intensity =
      Math.max(
        0.35,
        Math.min(1, speed * 0.75)
      );

    playSelectedChord(
      intensity,
      direction
    );

    lastStrumAt = now;
  }

  /*
    Slower controlled vertical movement produces
    individual melodic guitar notes.
  */

  if (
    speed > 0.10 &&
    speed < STRUM_MINIMUM_SPEED &&
    now - lastStrumAt >= 170
  ) {
    playMelodicNote(
      point.y,
      Math.max(
        0.32,
        Math.min(0.72, speed)
      )
    );

    lastStrumAt = now;
  }

  rightHandEnergy =
    Math.min(
      100,
      speed * 125
    );

  createParticles(
    point.screenX,
    point.screenY,
    "#ff4ea3",
    Math.max(
      2,
      Math.floor(speed * 12)
    )
  );

  lastRightHandPosition = {
    x: point.x,
    y: point.y
  };

  lastRightHandTime = now;
}


/* =========================================================
   CANVAS SIZING
========================================================= */

function resizeCanvases() {
  const pixelRatio =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  [handCanvas, effectsCanvas].forEach(
    (canvas) => {
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
    }
  );
}


/* =========================================================
   PARTICLE EFFECTS
========================================================= */

function createParticles(
  x,
  y,
  color,
  amount = 7
) {
  for (
    let index = 0;
    index < amount;
    index += 1
  ) {
    particles.push({
      x,
      y,

      velocityX:
        (Math.random() - 0.5) * 5,

      velocityY:
        (Math.random() - 0.5) * 5,

      life: 1,

      size:
        Math.random() * 4 + 1,

      color
    });
  }

  if (particles.length > 550) {
    particles.splice(
      0,
      particles.length - 550
    );
  }
}


function createStrumParticles(
  direction,
  intensity
) {
  const x =
    window.innerWidth * 0.72;

  const y =
    direction === "down"
      ? window.innerHeight * 0.38
      : window.innerHeight * 0.67;

  createParticles(
    x,
    y,
    "#ffd36d",
    Math.floor(
      14 + intensity * 26
    )
  );
}


function animateParticles() {
  effectsContext.fillStyle =
    "rgba(2, 4, 10, 0.14)";

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

    particle.life -= 0.019;

    effectsContext.globalAlpha =
      Math.max(0, particle.life);

    effectsContext.fillStyle =
      particle.color;

    effectsContext.shadowBlur = 15;
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
    requestAnimationFrame(
      animateParticles
    );
}


/* =========================================================
   POINT AND ZONE UTILITIES
========================================================= */

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


function convertLandmarkToScreen(landmark) {
  return {
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


/* =========================================================
   HAND DRAWING
========================================================= */

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

  for (
    const [
      firstIndex,
      secondIndex
    ] of connections
  ) {
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
      convertLandmarkToScreen(
        landmark
      );

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


/* =========================================================
   UPDATE HAND ZONES
========================================================= */

function updateHandZones(
  leftPoint,
  rightPoint
) {
  const leftPointInChordZone =
    pointIsInsideZone(
      leftPoint,
      LEFT_ZONE
    ) ||
    pointIsInsideZone(
      rightPoint,
      LEFT_ZONE
    );

  const rightPointInPlayZone =
    pointIsInsideZone(
      rightPoint,
      RIGHT_ZONE
    ) ||
    pointIsInsideZone(
      leftPoint,
      RIGHT_ZONE
    );


  /* LEFT HAND CHORD ZONE */

  if (leftPointInChordZone) {
    const activePoint =
      pointIsInsideZone(
        leftPoint,
        LEFT_ZONE
      )
        ? leftPoint
        : rightPoint;

    chooseChordFromLeftHand(
      activePoint
    );

    leftHandEnergy =
      Math.min(
        100,
        leftHandEnergy + 10
      );

    leftHandInside = true;

    createParticles(
      activePoint.screenX,
      activePoint.screenY,
      "#61e8ff",
      2
    );
  } else {
    leftHandInside = false;

    leftHandEnergy =
      Math.max(
        0,
        leftHandEnergy - 14
      );
  }


  /* RIGHT HAND PERFORMANCE ZONE */

  if (rightPointInPlayZone) {
    const activePoint =
      pointIsInsideZone(
        rightPoint,
        RIGHT_ZONE
      )
        ? rightPoint
        : leftPoint;

    rightHandInside = true;

    processRightHandMusic(
      activePoint
    );
  } else {
    rightHandInside = false;

    processRightHandMusic(null);

    rightHandEnergy =
      Math.max(
        0,
        rightHandEnergy - 18
      );

    rightFrequencyElement.textContent =
      "Move to play";

    /*
      The currently ringing notes are allowed to decay
      naturally like guitar strings.

      stopAllSounds() is used when ALL hands disappear,
      the window loses focus or the Stop button is clicked.
    */
  }

  updateZoneInterface();
}


/* =========================================================
   ZONE INTERFACE
========================================================= */

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

  if (
    leftHandInside &&
    rightHandInside
  ) {
    mainMessageElement.textContent =
      "Chord selected. Right hand is performing.";

    subMessageElement.textContent =
      "Move quickly to strum or slowly to play notes";
  } else if (leftHandInside) {
    mainMessageElement.textContent =
      "Choose a chord with the left hand";

    subMessageElement.textContent =
      "Move vertically between C, Am, F and G";
  } else if (rightHandInside) {
    mainMessageElement.textContent =
      "The right hand is playing the guitar";

    subMessageElement.textContent =
      "Speed controls intensity and height controls pitch";
  } else {
    mainMessageElement.textContent =
      "Place the left hand in the chord zone";

    subMessageElement.textContent =
      "Then move the right hand inside the performance zone";
  }
}


/* =========================================================
   MEDIAPIPE RESULTS
========================================================= */

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

    if (
      timeWithoutHands >
      HAND_LOST_DELAY
    ) {
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

      /*
        Landmark 9 represents a central palm point.
      */

      const palmPoint =
        convertLandmarkToScreen(
          landmarks[9]
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


/* =========================================================
   MEDIAPIPE INITIALIZATION
========================================================= */

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


/* =========================================================
   CAMERA START
========================================================= */

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

    startScreen.classList.add(
      "hidden"
    );

    experience.classList.remove(
      "hidden"
    );

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


/* =========================================================
   CAMERA RESTART
========================================================= */

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


/* =========================================================
   ERROR DISPLAY
========================================================= */

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


/* =========================================================
   VOLUME
========================================================= */

masterVolumeInput.addEventListener(
  "input",
  () => {
    const volume =
      Number(
        masterVolumeInput.value
      );

    volumeValueElement.textContent =
      `${Math.round(volume * 200)}%`;

    if (
      masterGainNode &&
      audioContext
    ) {
      masterGainNode.gain.linearRampToValueAtTime(
        volume,
        audioContext.currentTime + 0.05
      );
    }
  }
);


/* =========================================================
   BUTTON EVENTS
========================================================= */

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


/* =========================================================
   SAFETY EVENTS
========================================================= */

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


/* =========================================================
   INITIAL INTERFACE
========================================================= */

leftNoteElement.textContent =
  CHORDS[selectedChordIndex].shortName;

leftFrequencyElement.textContent =
  CHORDS[selectedChordIndex].name;

rightNoteElement.textContent =
  "GUITAR";

rightFrequencyElement.textContent =
  "Move to play";

updateZoneInterface();
resizeCanvases();
