import { useRef, useMemo, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  createHeightmapSurface,
  buildCumulativeHeightmaps,
  applyPartialCut,
  sampleMovePoint,
  type HeightmapSurface,
} from '../lib/heightmapCarve'
import type { CutMove } from '../lib/toolpathPrograms'
import { getMaterialById, type ToolDef } from '../lib/toolLibrary'

interface CncSceneProps {
  /** 刀路移动列表 */
  moves: CutMove[]
  /** 当前播放到的 move 索引 */
  currentMoveIndex: number
  /** 当前 move 内的进度 0~1 */
  currentT: number
  /** 是否正在切削（用于颜色指示） */
  isCutting: boolean
  /** 工件参数 */
  workpiece: { width: number; depth: number; height: number }
  /** 分辨率 */
  resolution: number
  /** 材质 ID */
  materialId: string
  /** 重置信号 */
  resetSignal: number
  /** 是否显示刀路线 */
  showToolpath: boolean
}

/**
 * CNC 工件 + 工作台 + 主轴 + 刀路 + 回放切削
 */
export default function CncScene({
  moves,
  currentMoveIndex,
  currentT,
  isCutting,
  workpiece,
  resolution,
  materialId,
  resetSignal,
  showToolpath,
}: CncSceneProps) {
  const { invalidate } = useThree()

  // 网格原点（工件前左角，以工件中心为世界原点）
  const originX = -workpiece.width / 2
  const originZ = workpiece.depth / 2

  // 高度图表面
  const surface = useMemo<HeightmapSurface>(
    () => createHeightmapSurface(workpiece.width, workpiece.depth, resolution, originX, originZ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workpiece.width, workpiece.depth, resolution],
  )

  // 预计算累积高度图（用于快速回放跳转）
  const cumulative = useMemo(() => {
    if (moves.length === 0) return null
    return buildCumulativeHeightmaps(moves, resolution, workpiece.width, workpiece.depth, originX, originZ, workpiece.height)
  }, [moves, resolution, workpiece.width, workpiece.depth, workpiece.height]) // eslint-disable-next-line react-hooks/exhaustive-deps

  // 实时切削 buffer
  const liveBuffer = useRef<Float32Array | null>(null)
  if (liveBuffer.current == null) {
    liveBuffer.current = new Float32Array((resolution + 1) * (resolution + 1))
  }

  const lastApplied = useRef<{ idx: number; t: number }>({ idx: -1, t: -1 })

  // 重置
  useEffect(() => {
    surface.reset()
    lastApplied.current = { idx: -1, t: -1 }
  }, [resetSignal, surface])

  // 每帧更新高度图（回放驱动）
  useFrame(() => {
    if (!cumulative || moves.length === 0) return
    const idx = Math.min(currentMoveIndex, moves.length - 1)
    const t = currentT

    if (lastApplied.current.idx === idx && Math.abs(lastApplied.current.t - t) < 0.001) return
    lastApplied.current = { idx, t }

    const base = cumulative[idx] ?? cumulative[cumulative.length - 1]
    const move = moves[idx]
    // 直接写入 surface.heights，这样 surface.apply() 才能读到切削结果
    applyPartialCut(surface.heights, base, move, t, resolution, workpiece.width, workpiece.depth, originX, originZ, workpiece.height)
    surface.apply()
    invalidate()
  })

  // 当前刀尖位置（世界坐标）
  const toolTip = useMemo(() => {
    if (moves.length === 0) return new THREE.Vector3(0, 5, 0)
    const idx = Math.min(currentMoveIndex, moves.length - 1)
    const move = moves[idx]
    const p = sampleMovePoint(move, currentT)
    // G-code: X→X, Y→Z, Z→Y(高度)
    return new THREE.Vector3(
      p.x - workpiece.width / 2,
      p.z,
      -(p.y - workpiece.depth / 2),
    )
  }, [currentMoveIndex, currentT, moves, workpiece.width, workpiece.depth])

  // ============ 材质 ============
  const mat = useMemo(() => getMaterialById(materialId), [materialId])
  const sideMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: mat.sideColor, roughness: mat.roughness + 0.05, metalness: mat.metalness,
    transparent: true, opacity: 0.35,
  }), [mat])
  const topMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: mat.color, roughness: mat.roughness, metalness: mat.metalness, side: THREE.DoubleSide,
  }), [mat])
  const bottomMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: mat.sideColor, roughness: 0.5, metalness: 0.8,
  }), [mat])
  const hiddenMat = useMemo(() => new THREE.MeshStandardMaterial({ visible: false }), [])

  return (
    <group>
      {/* 工作台 */}
      <MachineBed width={workpiece.width} depth={workpiece.depth} height={workpiece.height} />

      {/* 工件 */}
      <group>
        {/* 工件主体 */}
        <mesh position={[0, -workpiece.height / 2, 0]} castShadow receiveShadow
          material={[sideMat, sideMat, hiddenMat, bottomMat, sideMat, sideMat]}>
          <boxGeometry args={[workpiece.width, workpiece.height, workpiece.depth]} />
        </mesh>
        {/* 顶面高度图 */}
        <mesh geometry={surface.geometry} material={topMat} receiveShadow castShadow />
        {/* 边线 */}
        <lineSegments position={[0, -workpiece.height / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(workpiece.width, workpiece.height, workpiece.depth)]} />
          <lineBasicMaterial color="#666" transparent opacity={0.3} />
        </lineSegments>
      </group>

      {/* 刀路线 */}
      {showToolpath && <ToolpathLines moves={moves} workpiece={workpiece} currentIndex={currentMoveIndex} />}

      {/* 主轴 + 刀具 */}
      <SpindleAssembly toolTip={toolTip} isCutting={isCutting} currentTool={moves[Math.min(currentMoveIndex, moves.length - 1)]?.tool} />
    </group>
  )
}

// ===================== 工作台 =====================

function MachineBed({ width, depth, height }: { width: number; depth: number; height: number }) {
  const bedW = Math.max(width + 6, 12)
  const bedD = Math.max(depth + 6, 12)
  const bedH = 1.0
  const bedY = -height - bedH / 2

  const metalDark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.55, metalness: 0.7 }), [])
  const metalLight = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5a6068', roughness: 0.5, metalness: 0.8 }), [])
  const accentMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.4, metalness: 0.4, emissive: '#f97316', emissiveIntensity: 0.15 }), [])

  return (
    <group position={[0, bedY, 0]}>
      {/* 台面主体 */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[bedW, bedH, bedD]} />
        <primitive object={metalLight} attach="material" />
      </mesh>
      {/* T 型槽 */}
      {[-1.5, 0, 1.5].map((x) => (
        <mesh key={x} position={[x, bedH / 2 + 0.01, 0]}>
          <boxGeometry args={[0.3, 0.05, bedD - 1]} />
          <primitive object={metalDark} attach="material" />
        </mesh>
      ))}
      {/* 导轨装饰条 */}
      <mesh position={[0, bedH / 2 + 0.02, bedD / 2 - 0.3]}>
        <boxGeometry args={[bedW - 1, 0.08, 0.08]} />
        <primitive object={accentMat} attach="material" />
      </mesh>
      <mesh position={[0, bedH / 2 + 0.02, -bedD / 2 + 0.3]}>
        <boxGeometry args={[bedW - 1, 0.08, 0.08]} />
        <primitive object={accentMat} attach="material" />
      </mesh>
    </group>
  )
}

// ===================== 刀路线 =====================

function ToolpathLines({ moves, workpiece, currentIndex }: { moves: CutMove[]; workpiece: { width: number; depth: number }; currentIndex: number }) {
  const { feedGeo, rapidGeo, playedGeo } = useMemo(() => {
    const feedPos: number[] = []
    const rapidPos: number[] = []
    const playedPos: number[] = []

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i]
      // G-code: X→world X, Z→world Y(高度), Y→world Z(深度)
      const toThree = (p: { x: number; y: number; z: number }): [number, number, number] => [
        p.x - workpiece.width / 2,
        p.z,
        -(p.y - workpiece.depth / 2),
      ]

      const fromP = toThree(m.from)
      const toP = toThree(m.to)

      if (m.type === 'rapid') {
        // lineSegments 需要顶点成对：from, to
        rapidPos.push(...fromP, ...toP)
      } else {
        feedPos.push(...fromP, ...toP)
      }

      // 已执行的部分用更亮的颜色
      if (i < currentIndex) {
        playedPos.push(...fromP, ...toP)
      }
    }

    const mkGeo = (pos: number[]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      return g
    }
    return {
      feedGeo: mkGeo(feedPos),
      rapidGeo: mkGeo(rapidPos),
      playedGeo: mkGeo(playedPos),
    }
  }, [moves, workpiece.width, workpiece.depth, currentIndex])

  return (
    <group>
      {/* 已执行的刀路 — 白色高亮 */}
      <lineSegments geometry={playedGeo}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.9} />
      </lineSegments>
      {/* 切削进给 — 青色实线 */}
      <lineSegments geometry={feedGeo}>
        <lineBasicMaterial color="#22d3ee" transparent opacity={0.5} />
      </lineSegments>
      {/* 快速移动 — 琥珀色 */}
      <lineSegments geometry={rapidGeo}>
        <lineBasicMaterial color="#f59e0b" transparent opacity={0.35} />
      </lineSegments>
    </group>
  )
}

// ===================== 主轴 + 刀具 =====================

function SpindleAssembly({ toolTip, isCutting, currentTool }: { toolTip: THREE.Vector3; isCutting: boolean; currentTool?: ToolDef }) {
  const spindleRef = useRef<THREE.Group>(null!)
  const toolSpinRef = useRef<THREE.Group>(null!)
  const spinAccum = useRef(0)

  // 材质
  const housingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: 0.4, metalness: 0.8 }), [])
  const motorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#22262c', roughness: 0.5, metalness: 0.7 }), [])
  const quillMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b8bec7', roughness: 0.25, metalness: 0.95 }), [])
  const toolMat = useMemo(() => new THREE.MeshStandardMaterial({ color: currentTool?.color ?? '#e8c878', roughness: 0.25, metalness: 0.95, emissive: new THREE.Color(currentTool?.color ?? '#e8c878').multiplyScalar(0.12), emissiveIntensity: 0.3 }), [currentTool])

  useFrame((_, dt) => {
    if (!spindleRef.current) return
    // 主轴 X/Z 跟随刀尖
    spindleRef.current.position.x = toolTip.x
    spindleRef.current.position.z = toolTip.z

    // 刀具 Y 位置：刀尖（group y=0）需对齐 toolTip.y
    const toolLen = currentTool?.length ?? 4
    spindleRef.current.position.y = toolTip.y

    // 旋转
    if (toolSpinRef.current) {
      spinAccum.current += dt * (isCutting ? 20 : 5)
      toolSpinRef.current.rotation.y = spinAccum.current
    }
  })

  if (!currentTool) return null
  const r = currentTool.diameter / 2
  const toolLen = currentTool.length
  const shankR = currentTool.shankDiameter / 2

  // 从 y=0（刀尖）向上连续堆叠，每段的顶部 = 下一段的底部，无缝衔接
  const cutH = toolLen * 0.35          // 切削刃高度
  const shankH = toolLen - cutH        // 刀柄高度（补满到 toolLen）
  const colletH = 0.3                  // 夹头
  const noseH = 0.8                    // 主轴锥（圆台）
  const housingH = 1.5                 // 轴承壳
  const motorH = 2.5                   // 电机

  const colletY = toolLen + colletH / 2
  const noseY = toolLen + colletH + noseH / 2
  const housingY = toolLen + colletH + noseH + housingH / 2
  const motorY = toolLen + colletH + noseH + housingH + motorH / 2

  return (
    <group ref={spindleRef}>
      {/* —— 固定主轴壳体（不旋转）—— */}
      {/* 电机 */}
      <mesh position={[0, motorY, 0]} castShadow>
        <cylinderGeometry args={[0.8, 0.8, motorH, 20]} />
        <primitive object={motorMat} attach="material" />
      </mesh>
      {/* 轴承壳 */}
      <mesh position={[0, housingY, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, housingH, 20]} />
        <primitive object={housingMat} attach="material" />
      </mesh>
      {/* 主轴锥（圆台：上粗下细，连接壳体与夹头）*/}
      <mesh position={[0, noseY, 0]} castShadow>
        <cylinderGeometry args={[0.7, Math.max(shankR + 0.15, 0.5), noseH, 20]} />
        <primitive object={quillMat} attach="material" />
      </mesh>
      {/* 夹头（连接刀柄与主轴锥）*/}
      <mesh position={[0, colletY, 0]} castShadow>
        <cylinderGeometry args={[Math.max(shankR + 0.15, 0.5), shankR + 0.05, colletH, 16]} />
        <primitive object={quillMat} attach="material" />
      </mesh>

      {/* —— 旋转刀具组 —— */}
      <group ref={toolSpinRef}>
        {/* 刀柄：紧接切削刃顶部，延伸到 toolLen */}
        <mesh position={[0, cutH + shankH / 2, 0]} castShadow>
          <cylinderGeometry args={[shankR, shankR, shankH, 16]} />
          <primitive object={quillMat} attach="material" />
        </mesh>
        {/* 切削刃：从 y=0 到 y=cutH */}
        <mesh position={[0, cutH / 2, 0]} castShadow>
          <cylinderGeometry args={[r, r, cutH, 16]} />
          <primitive object={toolMat} attach="material" />
        </mesh>
        {/* 刀尖 */}
        {currentTool.type === 'end_mill' && (
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[r, r, 0.15, 16]} />
            <primitive object={toolMat} attach="material" />
          </mesh>
        )}
        {currentTool.type === 'ball_nose' && (
          <mesh position={[0, 0, 0]} castShadow>
            <sphereGeometry args={[r, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <primitive object={toolMat} attach="material" />
          </mesh>
        )}
        {currentTool.type === 'drill' && (
          <mesh position={[0, 0.15, 0]} castShadow>
            <coneGeometry args={[r, r * 2, 16]} />
            <primitive object={toolMat} attach="material" />
          </mesh>
        )}
      </group>
    </group>
  )
}
