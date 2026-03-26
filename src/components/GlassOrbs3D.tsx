'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'

export default function GlassOrbs3D() {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.z = 6

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0xf5f0fa, 1) // near-white pastel background
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Post-processing: shallow depth of field (f/1.2)
    const composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)

    const bokehPass = new BokehPass(scene, camera, {
      focus: 5.5,
      aperture: 0.025,
      maxblur: 0.025,
    })
    composer.addPass(bokehPass)

    // Bright pastel lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(3, 5, 4)
    scene.add(directionalLight)

    const pointLight1 = new THREE.PointLight(0xffaadd, 2.0, 20)
    pointLight1.position.set(-4, 3, 3)
    scene.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0xaaddff, 1.8, 20)
    pointLight2.position.set(4, -2, 3)
    scene.add(pointLight2)

    const pointLight3 = new THREE.PointLight(0xaaffdd, 1.5, 15)
    pointLight3.position.set(0, -3, 2)
    scene.add(pointLight3)

    // Gradient sphere shader material
    function createGradientMaterial(colorTop: number, colorBottom: number, opacity: number) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          colorA: { value: new THREE.Color(colorTop) },
          colorB: { value: new THREE.Color(colorBottom) },
          opacity: { value: opacity },
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 colorA;
          uniform vec3 colorB;
          uniform float opacity;
          varying vec3 vWorldPosition;
          varying vec3 vNormal;
          void main() {
            // Gradient based on local Y (top to bottom)
            float mixFactor = vNormal.y * 0.5 + 0.5;
            vec3 baseColor = mix(colorB, colorA, mixFactor);

            // Subtle rim lighting
            vec3 viewDir = normalize(cameraPosition - vWorldPosition);
            float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
            rim = pow(rim, 2.5) * 0.4;

            // Soft diffuse shading
            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
            float diff = max(dot(vNormal, lightDir), 0.0) * 0.3 + 0.7;

            vec3 finalColor = baseColor * diff + vec3(1.0) * rim;
            gl_FragColor = vec4(finalColor, opacity);
          }
        `,
      })
      return mat
    }

    // Create orbs
    type OrbData = {
      mesh: THREE.Mesh
      basePos: THREE.Vector3
      speed: number
      amplitude: number
      phase: number
      baseScale: number
    }

    const orbs: OrbData[] = []

    // Pastel gradient pairs [topColor, bottomColor]
    const orbConfigs = [
      { radius: 1.1, top: 0xfeeef4, bottom: 0xe8f0fa, opacity: 0.55, pos: [-1.8, 0.8, -1.5], speed: 0.25, amp: 0.4 },
      { radius: 0.9, top: 0xf0ecfa, bottom: 0xf8ecf2, opacity: 0.50, pos: [2.0, 1.2, -1.0], speed: 0.35, amp: 0.5 },
      { radius: 1.0, top: 0xe8faf2, bottom: 0xf0ecfa, opacity: 0.48, pos: [-0.8, -1.5, -0.5], speed: 0.3, amp: 0.45 },
      { radius: 0.5, top: 0xfff2ee, bottom: 0xf2f8e8, opacity: 0.55, pos: [0.5, 1.8, 0.5], speed: 0.5, amp: 0.35 },
      { radius: 0.45, top: 0xe8f0fa, bottom: 0xf8e8f2, opacity: 0.50, pos: [-2.5, -0.5, 0.5], speed: 0.55, amp: 0.3 },
      { radius: 0.3, top: 0xfff0ea, bottom: 0xeef8f2, opacity: 0.55, pos: [1.2, -1.0, 1.0], speed: 0.65, amp: 0.25 },
      { radius: 1.6, top: 0xf4f0fa, bottom: 0xecf4fa, opacity: 0.25, pos: [1.0, 0.0, -3.5], speed: 0.15, amp: 0.6 },
      { radius: 0.25, top: 0xe4faf4, bottom: 0xfaecf2, opacity: 0.52, pos: [0.3, 2.2, 0.8], speed: 0.7, amp: 0.2 },
      { radius: 0.7, top: 0xf8ecfa, bottom: 0xe8f8f2, opacity: 0.45, pos: [-1.2, 1.8, 0], speed: 0.4, amp: 0.4 },
      { radius: 0.35, top: 0xe4eefa, bottom: 0xfaecee, opacity: 0.50, pos: [2.5, -1.5, 0.3], speed: 0.6, amp: 0.3 },
    ]

    const sphereGeo = new THREE.SphereGeometry(1, 64, 64)

    orbConfigs.forEach(cfg => {
      const mat = createGradientMaterial(cfg.top, cfg.bottom, cfg.opacity)
      const mesh = new THREE.Mesh(sphereGeo, mat)
      mesh.scale.setScalar(cfg.radius)
      mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2])
      scene.add(mesh)

      orbs.push({
        mesh,
        basePos: new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]),
        speed: cfg.speed,
        amplitude: cfg.amp,
        phase: Math.random() * Math.PI * 2,
        baseScale: cfg.radius,
      })
    })

    // Mouse interaction
    const mouse = { x: 0, y: 0 }
    function onMouseMove(e: MouseEvent) {
      mouse.x = (e.clientX / width - 0.5) * 2
      mouse.y = -(e.clientY / height - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouseMove)

    // Animation
    const clock = new THREE.Clock()
    let animationId: number

    function animate() {
      animationId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Animate orbs
      orbs.forEach(orb => {
        const { mesh, basePos, speed, amplitude, phase, baseScale } = orb
        mesh.position.x = basePos.x + Math.sin(t * speed + phase) * amplitude
        mesh.position.y = basePos.y + Math.cos(t * speed * 0.7 + phase + 1) * amplitude * 0.8
        mesh.position.z = basePos.z + Math.sin(t * speed * 0.4 + phase + 2) * amplitude * 0.3

        // Gentle scale breathing
        const breathe = 1 + Math.sin(t * speed * 1.2 + phase) * 0.04
        mesh.scale.setScalar(baseScale * breathe)

        // Subtle rotation for iridescence shimmer
        mesh.rotation.y = t * speed * 0.3 + phase
        mesh.rotation.x = Math.sin(t * speed * 0.2 + phase) * 0.2
      })

      // Animate lights for color shifting
      pointLight1.position.x = -4 + Math.sin(t * 0.3) * 2
      pointLight1.position.y = 3 + Math.cos(t * 0.2) * 1.5
      pointLight2.position.x = 4 + Math.cos(t * 0.25) * 2
      pointLight3.position.y = -3 + Math.sin(t * 0.35) * 1

      // Camera subtle movement following mouse
      camera.position.x += (mouse.x * 0.3 - camera.position.x) * 0.02
      camera.position.y += (mouse.y * 0.3 - camera.position.y) * 0.02
      camera.lookAt(0, 0, 0)

      composer.render()
    }
    animate()

    // Resize
    function onResize() {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  )
}
