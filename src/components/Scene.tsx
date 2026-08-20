import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Environment, Lightformer, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import type { AppState, VoxelizationResult, VertexData } from '../types'
import type { CutMove } from '../lib/toolpathPrograms'
import VertexEditor from './VertexEditor'
import VoxelVisualizer from './VoxelVisualizer'
import CncSceneV2 from './CncSceneV2'

interface SceneProps {
  state: AppState
  geometry: THREE.BufferGeometry
  vertices: VertexData[]
  voxelResult: VoxelizationResult | null
  onSelectVertex: (index: number) => void
  onDragVertex: (index: number, position: THREE.Vector3) => void
  onDragEnd: () => void
  /** CNC 模式：解析后的刀路 */
  cncMoves: CutMove[]
}

/** 内部场景内容 */
function SceneContent(props: SceneProps) {
  const { state, geometry, vertices, voxelResult, onSelectVertex, onDragVertex, onDragEnd } = props

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 15, 8]} intensity={1.2} castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10} shadow-camera-right={10}
        shadow-camera-top={10} shadow-camera-bottom={-10} />
      <directionalLight position={[-8, 5, -5]} intensity={0.4} />
      {/* 程序化环境光（Lightformer 本地渲染立方体贴图，不依赖外部 HDR CDN） */}
      <Environment resolution={64}>
        <Lightformer intensity={2} position={[10, 15, 8]} scale={10} />
        <Lightformer intensity={1} position={[-8, 5, -5]} scale={10} />
        <Lightformer intensity={0.5} position={[0, -5, 0]} scale={10} color="#4a90d9" />
      </Environment>

      {state.mode === 'vertex' && (
        <VertexEditor geometry={geometry} vertices={vertices}
          selectedIndex={state.vertexEdit.selectedIndex}
          onSelectVertex={onSelectVertex} onDragVertex={onDragVertex} onDragEnd={onDragEnd}
          showWireframe={state.render.showWireframe} showVertices={state.render.showVertices} />
      )}
      {state.mode === 'voxel' && (
        <VoxelVisualizer result={voxelResult} config={state.voxelConfig} showEdges={true} />
      )}
      {state.mode === 'cnc' && (
        <CncSceneV2
          moves={props.cncMoves}
          currentMoveIndex={state.playback.currentMoveIndex}
          currentT={state.playback.currentT}
          isCutting={state.cncConfig.isCutting}
          workpiece={state.cncConfig.workpiece}
          resolution={state.cncConfig.resolution}
          materialId={state.cncConfig.materialId}
          resetSignal={0}
          showToolpath={state.playback.showToolpath}
        />
      )}

      {state.render.showGrid && (
        <Grid args={[30, 30]} cellSize={1} cellThickness={0.5}
          cellColor="#2a3a4a" sectionSize={5} sectionThickness={1} sectionColor="#4a90d9"
          fadeDistance={30} fadeStrength={1}
          position={[0, state.mode === 'cnc' ? -state.cncConfig.workpiece.height - 1.2 : -3, 0]}
          infiniteGrid />
      )}
      {state.mode === 'cnc' && (
        <ContactShadows position={[0, -state.cncConfig.workpiece.height - 1.1, 0]}
          opacity={0.4} scale={20} blur={2} far={10} resolution={512} />
      )}
      {state.render.showAxes && (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ff6b35', '#4ecdc4', '#6ab7ff']} labelColor="white" />
        </GizmoHelper>
      )}
    </>
  )
}

export default function Scene(props: SceneProps) {
  return (
    <Canvas shadows camera={{ position: [8, 6, 10], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ scene }) => {
        scene.background = new THREE.Color('#0d1117')
        scene.fog = new THREE.Fog('#0d1117', 20, 50)
      }}>
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08}
        autoRotate={props.state.render.autoRotate} autoRotateSpeed={0.5}
        minDistance={3} maxDistance={60} />
    </Canvas>
  )
}
