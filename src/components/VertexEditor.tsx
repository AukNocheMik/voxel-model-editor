import { useRef, useMemo, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { VertexData } from '../types'

interface VertexHandleProps {
  vertex: VertexData
  index: number
  isSelected: boolean
  onSelect: (index: number) => void
  onDrag: (index: number, position: THREE.Vector3) => void
  onDragEnd: () => void
}

/** 拖拽触发阈值（屏幕像素距离），超过此距离才认为是拖拽而非点击 */
const DRAG_THRESHOLD_PX = 5

/**
 * 单个顶点的可交互手柄（小球）。
 *
 * 交互逻辑：
 * - 单击 = 选中顶点（不拖拽）
 * - 长按 + 移动超过阈值 = 进入拖拽模式
 * - 拖拽时禁用 OrbitControls，避免相机同时旋转
 * - 拖拽时直接通过 ref 更新小球位置，保证实时跟随
 */
function VertexHandle({
  vertex,
  index,
  isSelected,
  onSelect,
  onDrag,
  onDragEnd,
}: VertexHandleProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const { gl, camera, raycaster, pointer, controls } = useThree()

  // 用 ref 管理拖拽状态，避免每帧触发 React re-render
  const dragState = useRef({
    pointerDown: false, // 鼠标按下中
    dragging: false,    // 已超过阈值，进入真正拖拽
    downX: 0,
    downY: 0,
  })

  // 拖拽辅助平面：垂直于相机视线方向，过顶点当前位置
  const dragPlane = useMemo(() => new THREE.Plane(), [])
  const hitPoint = useRef(new THREE.Vector3())

  // ============ 全局指针事件监听 ============
  // 用 window 级别监听确保即使指针离开小球也能正确结束拖拽
  useEffect(() => {
    const dom = gl.domElement
    const s = dragState.current

    const onPointerMove = (e: PointerEvent) => {
      if (!s.pointerDown || s.dragging) return

      // 检查是否超过拖拽阈值
      const dx = e.clientX - s.downX
      const dy = e.clientY - s.downY
      if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        // 进入拖拽模式
        s.dragging = true
        // 禁用轨道控制器，防止相机同时旋转
        if (controls) {
          (controls as any).enabled = false
        }
        dom.style.cursor = 'grabbing'
      }
    }

    const onPointerUp = () => {
      if (s.dragging) {
        // 结束拖拽
        s.dragging = false
        if (controls) {
          (controls as any).enabled = true
        }
        dom.style.cursor = 'auto'
        onDragEnd()
      }
      s.pointerDown = false
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [gl, controls, onDragEnd])

  // ============ 按下事件 ============
  const handlePointerDown = (e: any) => {
    e.stopPropagation()
    // 选中顶点
    onSelect(index)

    const s = dragState.current
    s.pointerDown = true
    s.dragging = false
    s.downX = e.nativeEvent.clientX
    s.downY = e.nativeEvent.clientY

    // 准备拖拽平面：法线为相机朝向，经过顶点当前位置
    const camDir = new THREE.Vector3()
    camera.getWorldDirection(camDir)
    dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), vertex.current)
  }

  // ============ 每帧更新（仅拖拽时） ============
  useFrame(() => {
    const s = dragState.current
    if (!s.dragging) return

    // 从鼠标位置发射射线，与拖拽平面相交
    raycaster.setFromCamera(pointer, camera)
    if (raycaster.ray.intersectPlane(dragPlane, hitPoint.current)) {
      // 通知父组件更新几何体
      onDrag(index, hitPoint.current.clone())
      // 直接通过 ref 更新小球位置，确保即时跟随
      if (meshRef.current) {
        meshRef.current.position.copy(hitPoint.current)
      }
    }
  })

  const color = isSelected ? '#ff6b35' : '#4ecdc4'
  const scale = isSelected ? 0.18 : 0.12

  return (
    <mesh
      ref={meshRef}
      position={vertex.current}
      onPointerDown={handlePointerDown}
      onPointerOver={(e) => {
        e.stopPropagation()
        if (!dragState.current.dragging) gl.domElement.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!dragState.current.dragging) gl.domElement.style.cursor = 'auto'
      }}
    >
      <sphereGeometry args={[scale, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isSelected ? 0.8 : 0.3}
        roughness={0.3}
        metalness={0.5}
      />
    </mesh>
  )
}

interface VertexEditorProps {
  geometry: THREE.BufferGeometry
  vertices: VertexData[]
  selectedIndex: number
  onSelectVertex: (index: number) => void
  onDragVertex: (index: number, position: THREE.Vector3) => void
  onDragEnd: () => void
  showWireframe: boolean
  showVertices: boolean
}

/**
 * 顶点编辑模式主体组件。
 * 渲染半透明模型 + 顶点手柄 + 线框。
 */
export default function VertexEditor({
  geometry,
  vertices,
  selectedIndex,
  onSelectVertex,
  onDragVertex,
  onDragEnd,
  showWireframe,
  showVertices,
}: VertexEditorProps) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const wireframeRef = useRef<THREE.LineSegments>(null!)

  // 线框几何体
  const edgesGeometry = useMemo(() => {
    const edges = new THREE.EdgesGeometry(geometry, 1)
    return edges
  }, [geometry])

  return (
    <group>
      {/* 半透明实体模型 */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#4a90d9"
          transparent
          opacity={0.35}
          roughness={0.4}
          metalness={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 线框 */}
      {showWireframe && (
        <lineSegments ref={wireframeRef} geometry={edgesGeometry}>
          <lineBasicMaterial color="#6ab7ff" transparent opacity={0.6} />
        </lineSegments>
      )}

      {/* 顶点手柄 */}
      {showVertices &&
        vertices.map((v, i) => (
          <VertexHandle
            key={i}
            vertex={v}
            index={i}
            isSelected={i === selectedIndex}
            onSelect={onSelectVertex}
            onDrag={onDragVertex}
            onDragEnd={onDragEnd}
          />
        ))}
    </group>
  )
}
