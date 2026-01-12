// main.js — module
// Robust three.js hero with device-aware performance fallbacks, reduced-motion respect,
// pause-on-hidden, and gentle pointer/device-motion parallax.

import * as THREE from "https://unpkg.com/three@0.152.0/build/three.module.js";

const canvas = document.getElementById("glcanvas");
const body = document.body;
const heroStatic = document.getElementById("heroStatic");
const titleEl = document.getElementById("ohm-title-js");

function isWebGLAvailable() {
  try {
    const ctx =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!ctx;
  } catch (e) {
    return false;
  }
}

// Device heuristics
const ua = navigator.userAgent || "";
const isMobileUA = /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
const coarsePointer =
  window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const isMobile = isMobileUA || coarsePointer;

// Respect user preference for reduced motion
const prefersReducedMotion =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// If WebGL is not available, don't attempt to initialize three.js
if (!isWebGLAvailable()) {
  body.classList.add("no-webgl");
  if (heroStatic) heroStatic.hidden = false;
  if (titleEl) titleEl.setAttribute("aria-hidden", "false");
  // still set year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  // exit early
  console.warn("WebGL not available — using static hero.");
} else {
  // Setup scene, camera, renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    innerWidth / innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 6);

  // Pixel ratio & renderer tuned for device
  const maxPixelRatio = Math.min(
    window.devicePixelRatio || 1,
    isMobile ? 1.5 : 2
  );
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0x000000, 0);

  // Lights
  const hemi = new THREE.HemisphereLight(0xbfefff, 0x202022, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 3, 4);
  scene.add(key);
  const fill = new THREE.PointLight(0x6be3ff, 0.45, 12);
  fill.position.set(-3, -1, 3);
  scene.add(fill);

  // Geometry: use lower detail on mobile for performance
  const detail = isMobile ? 64 : 120;
  const geo = new THREE.TorusKnotGeometry(0.9, 0.28, detail, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x7df0ff,
    metalness: 0.35,
    roughness: 0.22,
    envMapIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  // Responsive handlers
  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2)
    );
  }
  addEventListener("resize", onResize);
  addEventListener("orientationchange", () => setTimeout(onResize, 150));

  // Scroll-following and parallax targets
  let targetScroll = 0;
  let currentScroll = 0;
  addEventListener(
    "scroll",
    () => {
      targetScroll = window.scrollY || window.pageYOffset;
    },
    { passive: true }
  );

  // Pointer + device motion parallax
  let pointerX = 0,
    pointerY = 0,
    deviceX = 0,
    deviceY = 0;
  function onPointer(e) {
    const nx = e.clientX / innerWidth - 0.5;
    const ny = e.clientY / innerHeight - 0.5;
    pointerX = nx;
    pointerY = ny;
  }
  // Touch-friendly: use pointer events
  window.addEventListener("pointermove", onPointer, { passive: true });

  // Device orientation (optional, gentle)
  function onDeviceOrientation(ev) {
    if (!ev.beta && !ev.gamma) return;
    // normalize small values
    deviceX = (ev.gamma || 0) / 90; // -1..1
    deviceY = (ev.beta || 0) / 180; // -1..1
  }
  if (
    "DeviceOrientationEvent" in window &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    // iOS 13+ requires permission — skip automatic request to avoid prompt on load
    // user can enable if desired — but still listen in case permission is granted elsewhere
    // no request() here to keep UX clean
  } else if ("ondeviceorientation" in window) {
    window.addEventListener("deviceorientation", onDeviceOrientation, true);
  }

  // Throttle animation for mobile / low-power
  const targetFPS = prefersReducedMotion ? 0 : isMobile ? 30 : 60;
  let then = performance.now();
  const interval = targetFPS > 0 ? 1000 / targetFPS : Infinity;

  // Pause rendering when page is hidden or canvas not visible
  let running = true;
  document.addEventListener(
    "visibilitychange",
    () => {
      running = document.visibilityState === "visible";
      if (running) then = performance.now(); // reset timer to avoid big jumps
    },
    false
  );

  // Pause when canvas is offscreen (e.g., scrolled away)
  let canvasVisible = true;
  const canvasObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        canvasVisible = entry.isIntersecting;
      }
    },
    { threshold: 0.05 }
  );
  canvasObserver.observe(canvas);

  // If user prefers reduced motion, render a single frame and exit
  const clock = new THREE.Clock();
  function renderFrame() {
    renderer.render(scene, camera);
  }

  function animate(now) {
    if (!running || !canvasVisible) {
      requestAnimationFrame(animate);
      return;
    }

    requestAnimationFrame(animate);

    if (targetFPS === 0) {
      // reduced motion: render only once at load and when relevant changes occur
      return;
    }

    const elapsed = now - then;
    if (elapsed < interval) return;
    then = now - (elapsed % interval);

    // Smooth scroll interpolation
    currentScroll += (targetScroll - currentScroll) * 0.08;
    const t =
      currentScroll / Math.max(1, document.body.scrollHeight - innerHeight);

    // camera subtle movement for depth; also add pointer/device parallax
    const parX = pointerX * 0.35 + deviceX * 0.12;
    const parY = pointerY * 0.35 + deviceY * 0.12;

    camera.position.z = 6 - t * 2.0;
    camera.position.y = (t - 0.5) * 1.2 + parY * 0.8;
    camera.position.x = parX * 0.6;

    // Mesh rotation & idle motion
    const et = clock.getElapsedTime();
    mesh.rotation.x = et * 0.25 + t * 1.2 + parY * 0.6;
    mesh.rotation.y = et * 0.32 + t * 0.6 + parX * 0.6;
    mesh.position.y = Math.sin(et * 0.6) * 0.06 + (t - 0.5) * -0.4;

    renderer.render(scene, camera);
  }

  // Initial render (and for reduced-motion case)
  renderFrame();
  if (!prefersReducedMotion) requestAnimationFrame(animate);

  // Expose a controlled method to wake a single render when reduced-motion is set
  if (prefersReducedMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        // If section becomes visible, render a single frame to ensure correct layout
        entries.forEach((e) => {
          if (e.isIntersecting) renderFrame();
        });
      },
      { root: null, threshold: 0.01 }
    );
    io.observe(document.getElementById("mission") || document.body);
  }
}

// IntersectionObserver for reveal-on-scroll (fade + slide)
const reveals = document.querySelectorAll(".reveal");
if (reveals.length) {
  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          obs.unobserve(entry.target);
        }
      }
    },
    {
      root: null,
      rootMargin: "0px 0px -10% 0px",
      threshold: 0.08,
    }
  );
  reveals.forEach((r) => io.observe(r));
}

// Set current year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();
