import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import * as THREE from 'three'
import Scene from './components/Scene'
import ControlPanel from './components/ControlPanelV2'
import { createGeometry, extractUniqueVertices, defaultGeometry } from './lib/geometryHelper'
import { voxelizeMesh } from './lib/voxelizer'
import { EXAMPLE_PROGRAMS, parseGCode, type CutMove } from './lib/toolpathPrograms'
import { TOOL_LIBRARY, MATERIAL_LIBRARY } from './lib/toolLibrary'
import type { AppState, AppMode, GeometryType, VertexData, VoxelizationResult } from './types'

function App() {
  // ============ 核心状态 ============
  const [state, setState] = useState<AppState>({
    mode: 'vertex',
    geometry: defaultGeometry(),
    vertexEdit: {
      vertices: [],
      selectedIndex: -1,
      isDragging: false,
    },
    voxelConfig: {
      resolution: 16,
      shellOnly: true,
      gap: 0.1,
      colorGradient: true,
    },
    cncConfig: {
      workpiece: { width: 8, depth: 8, height: 3 },
      tool: { type: 'end_mill', diameter: 1.0, length: 6, cutDepth: -1.0 },
      resolution: 80,
      isCutting: false,
      speedMultiplier: 1,
      materialId: 'aluminum',
    },
    playback: {
      isPlaying: false,
      currentMoveIndex: 0,
      currentT: 0,
      speed: 1,
      programId: 'circle_pocket',
      showToolpath: true,
      toolOverrideIndex: -1,
    },
    render: {
      showWireframe: true,
      showVertices: true,
      autoRotate: false,
      showGrid: true,
      showAxes: true,
    },
  })

  // ============ 几何体管理 ============
  // 基础几何体（由参数生成）
  const baseGeometry = useMemo(() => createGeometry(state.geometry), [state.geometry])

  // 唯一顶点列表（去重后）
  const uniqueBaseVertices = useMemo(() => extractUniqueVertices(baseGeometry), [baseGeometry])

  // 顶点编辑状态（独立管理，避免每次几何体变化都重置）
  const verticesRef = useRef<VertexData[]>([])
  const [vertices, setVertices] = useState<VertexData[]>([])
  const [verticesVersion, setVerticesVersion] = useState(0)

  // 体素化缓存键（提前声明，供后面的 effect 引用）
  const lastVoxelKey = useRef('')

  // 几何体标识：类型/细分度/尺寸 任一变化都视为新几何体
  const geoKey = `${state.geometry.type}_${state.geometry.detail}_${state.geometry.size.join(',')}`

  // 当几何体改变时（类型/细分度/尺寸变化），用新几何体的顶点重建顶点列表。
  // 使用 useEffect 而非渲染阶段副作用，避免 React 反模式。
  useEffect(() => {
    const newVerts = uniqueBaseVertices.map((v) => ({
      original: v.clone(),
      current: v.clone(),
      selected: false,
    }))
    verticesRef.current = newVerts
    setVertices(newVerts)
    setVerticesVersion((v) => v + 1)
    // 重置选中状态
    setState((p) => ({ ...p, vertexEdit: { ...p.vertexEdit, selectedIndex: -1 } }))
    // 标记体素需要更新
    lastVoxelKey.current = ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey])

  // ============ 变形后的几何体 ============
  // 将编辑后的顶点写回 geometry
  const editedGeometry = useMemo(() => {
    const geo = baseGeometry.clone()
    const currentVerts = verticesRef.current
    if (currentVerts.length === 0) return geo

    const position = geo.attributes.position
    // 建立 原始顶点 -> 当前位置 的映射
    const map = new Map<string, THREE.Vector3>()
    for (const vd of currentVerts) {
      const key = `${vd.original.x.toFixed(4)}_${vd.original.y.toFixed(4)}_${vd.original.z.toFixed(4)}`
      map.set(key, vd.current)
    }

    for (let i = 0; i < position.count; i++) {
      const ox = position.getX(i)
      const oy = position.getY(i)
      const oz = position.getZ(i)
      const key = `${ox.toFixed(4)}_${oy.toFixed(4)}_${oz.toFixed(4)}`
      const mapped = map.get(key)
      if (mapped) {
        position.setXYZ(i, mapped.x, mapped.y, mapped.z)
      }
    }
    position.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingBox()
    return geo
  }, [baseGeometry, verticesVersion])

  // ============ 体素化 ============
  const voxelMeshRef = useRef<THREE.Mesh | null>(null)
  const [voxelResult, setVoxelResult] = useState<VoxelizationResult | null>(null)

  const revoxelize = useCallback(() => {
    // 创建临时 mesh 进行体素化
    const tempMesh = new THREE.Mesh(editedGeometry)
    tempMesh.updateMatrixWorld(true)
    const result = voxelizeMesh(tempMesh, state.voxelConfig)
    setVoxelResult(result)
  }, [editedGeometry, state.voxelConfig])

  // 切换到体素模式时自动体素化
  const voxelKey = `${geoKey}_${verticesVersion}_${state.voxelConfig.resolution}_${state.voxelConfig.shellOnly}`
  if (state.mode === 'voxel' && voxelKey !== lastVoxelKey.current) {
    lastVoxelKey.current = voxelKey
    // 延迟到下一帧执行，确保 mesh 已更新
    setTimeout(() => revoxelize(), 0)
  }

  // ============ 事件处理 ============

  const handleModeChange = (mode: AppMode) => {
    setState((p) => ({ ...p, mode }))
    if (mode === 'voxel') {
      lastVoxelKey.current = '' // 强制重新体素化
    }
  }

  const handleGeometryTypeChange = (type: GeometryType) => {
    setState((p) => ({ ...p, geometry: { ...p.geometry, type } }))
  }

  const handleDetailChange = (detail: number) => {
    setState((p) => ({ ...p, geometry: { ...p.geometry, detail } }))
  }

  const handleSelectVertex = (index: number) => {
    setState((p) => ({ ...p, vertexEdit: { ...p.vertexEdit, selectedIndex: index } }))
  }

  const handleDragVertex = (index: number, position: THREE.Vector3) => {
    const verts = verticesRef.current
    if (verts[index]) {
      verts[index].current.copy(position)
      setVerticesVersion((v) => v + 1)
    }
  }

  const handleDragEnd = () => {
    setVertices(verticesRef.current.map((v) => ({ ...v, current: v.current.clone() })))
    // 标记体素需要更新
    lastVoxelKey.current = ''
  }

  const handleVertexNudge = (axis: 'x' | 'y' | 'z', delta: number) => {
    const idx = state.vertexEdit.selectedIndex
    if (idx >= 0 && verticesRef.current[idx]) {
      verticesRef.current[idx].current[axis] += delta
      setVerticesVersion((v) => v + 1)
      setVertices(verticesRef.current.map((v) => ({ ...v, current: v.current.clone() })))
      lastVoxelKey.current = ''
    }
  }

  const handleResetVertices = () => {
    const reset = verticesRef.current.map((v) => ({
      ...v,
      current: v.original.clone(),
    }))
    verticesRef.current = reset
    setVertices(reset)
    setVerticesVersion((v) => v + 1)
    lastVoxelKey.current = ''
  }

  const handleResolutionChange = (resolution: number) => {
    setState((p) => ({ ...p, voxelConfig: { ...p.voxelConfig, resolution } }))
    lastVoxelKey.current = ''
  }

  const handleShellOnlyToggle = () => {
    setState((p) => ({ ...p, voxelConfig: { ...p.voxelConfig, shellOnly: !p.voxelConfig.shellOnly } }))
    lastVoxelKey.current = ''
  }

  const handleGapChange = (gap: number) => {
    setState((p) => ({ ...p, voxelConfig: { ...p.voxelConfig, gap } }))
  }

  const handleColorGradientToggle = () => {
    setState((p) => ({ ...p, voxelConfig: { ...p.voxelConfig, colorGradient: !p.voxelConfig.colorGradient } }))
  }

  const handleToggleWireframe = () => setState((p) => ({ ...p, render: { ...p.render, showWireframe: !p.render.showWireframe } }))
  const handleToggleVertices = () => setState((p) => ({ ...p, render: { ...p.render, showVertices: !p.render.showVertices } }))
  const handleToggleAutoRotate = () => setState((p) => ({ ...p, render: { ...p.render, autoRotate: !p.render.autoRotate } }))
  const handleToggleGrid = () => setState((p) => ({ ...p, render: { ...p.render, showGrid: !p.render.showGrid } }))

  // 重新体素化按钮
  const handleRevoxelize = () => {
    lastVoxelKey.current = ''
    revoxelize()
  }

  // ============ CNC 回放系统 ============

  // 解析当前选中程序的 G-code，并应用刀具覆盖
  const cncMoves: CutMove[] = useMemo(() => {
    const prog = EXAMPLE_PROGRAMS.find((p) => p.id === state.playback.programId)
    if (!prog) return []
    const parsed = parseGCode(prog.gcode, 0, 0)
    // 如果用户手动选择了刀具，覆盖所有 move 的刀具
    if (state.playback.toolOverrideIndex >= 0) {
      const overrideTool = TOOL_LIBRARY[state.playback.toolOverrideIndex] ?? TOOL_LIBRARY[0]
      return parsed.map((m) => ({ ...m, tool: overrideTool, toolIndex: state.playback.toolOverrideIndex }))
    }
    return parsed
  }, [state.playback.programId, state.playback.toolOverrideIndex])

  // 回放动画驱动
  const playbackRef = useRef(state.playback)
  playbackRef.current = state.playback
  const movesRef = useRef(cncMoves)
  movesRef.current = cncMoves

  useEffect(() => {
    if (state.mode !== 'cnc') return
    let raf = 0
    let lastTime = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000) // cap dt to avoid jumps
      lastTime = now
      const pb = playbackRef.current
      const moves = movesRef.current

      if (pb.isPlaying && moves.length > 0) {
        const idx = pb.currentMoveIndex
        const move = moves[idx]
        if (move) {
          // 进给速度：每秒移动的单位距离
          const feedPerSec = (move.feedRate / 60) * pb.speed
          const tDelta = move.length > 0.0001 ? (feedPerSec * dt) / move.length : 1
          let newT = pb.currentT + tDelta
          let newIdx = idx

          if (newT >= 1) {
            newIdx++
            newT = 0
            if (newIdx >= moves.length) {
              newIdx = moves.length - 1
              newT = 1
              setState((p) => ({ ...p, playback: { ...p.playback, isPlaying: false, currentMoveIndex: newIdx, currentT: newT } }))
              playbackRef.current = { ...pb, isPlaying: false, currentMoveIndex: newIdx, currentT: newT }
              raf = requestAnimationFrame(tick)
              return
            }
          }

          const isCutting = moves[newIdx]?.type !== 'rapid' && newT < 1
          const updatedPb = { ...pb, currentMoveIndex: newIdx, currentT: newT }
          // 同步更新 ref 以避免下一帧读到旧值
          playbackRef.current = updatedPb
          setState((p) => ({
            ...p,
            cncConfig: { ...p.cncConfig, isCutting },
            playback: updatedPb,
          }))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state.mode])

  // CNC 控制处理
  const handleCncPlay = () => {
    setState((p) => {
      const newPb = { ...p.playback, isPlaying: !p.playback.isPlaying }
      playbackRef.current = newPb
      return { ...p, playback: newPb }
    })
  }
  const handleCncStop = () => {
    const newPb = { ...state.playback, isPlaying: false, currentMoveIndex: 0, currentT: 0 }
    playbackRef.current = newPb
    setState((p) => ({ ...p, playback: newPb }))
  }
  const handleCncStepForward = () => {
    const idx = state.playback.currentMoveIndex
    const t = state.playback.currentT
    let newIdx = idx, newT = t
    if (newT >= 0.99) { newIdx++; newT = 0 } else { newT = 1 }
    if (newIdx >= cncMoves.length) newIdx = cncMoves.length - 1
    const newPb = { ...state.playback, currentMoveIndex: newIdx, currentT: newT, isPlaying: false }
    playbackRef.current = newPb
    setState((p) => ({ ...p, playback: newPb }))
  }
  const handleCncStepBack = () => {
    let newIdx = state.playback.currentMoveIndex
    let newT = state.playback.currentT
    if (newT <= 0.01) { newIdx = Math.max(0, newIdx - 1); newT = 1 } else { newT = 0 }
    const newPb = { ...state.playback, currentMoveIndex: newIdx, currentT: newT, isPlaying: false }
    playbackRef.current = newPb
    setState((p) => ({ ...p, playback: newPb }))
  }
  const handleCncSpeedChange = (speed: number) => setState((p) => ({ ...p, playback: { ...p.playback, speed } }))
  const handleCncScrub = (progress: number) => {
    const totalIdx = Math.floor(progress * cncMoves.length)
    const newPb = { ...state.playback, currentMoveIndex: Math.min(totalIdx, cncMoves.length - 1), currentT: 0, isPlaying: false }
    playbackRef.current = newPb
    setState((p) => ({ ...p, playback: newPb }))
  }
  const handleProgramSelect = (programId: string) => setState((p) => ({ ...p, playback: { ...p.playback, programId, currentMoveIndex: 0, currentT: 0, isPlaying: false } }))
  const handleMaterialChange = (materialId: string) => setState((p) => ({ ...p, cncConfig: { ...p.cncConfig, materialId } }))
  const handleToggleToolpath = () => setState((p) => ({ ...p, playback: { ...p.playback, showToolpath: !p.playback.showToolpath } }))
  const handleToolOverride = (toolIndex: number) => {
    setState((p) => ({
      ...p,
      playback: {
        ...p.playback,
        toolOverrideIndex: p.playback.toolOverrideIndex === toolIndex ? -1 : toolIndex,
        currentMoveIndex: 0,
        currentT: 0,
        isPlaying: false,
      },
    }))
  }
  const handleCncWorkpieceChange = (key: 'width' | 'depth' | 'height', value: number) => setState((p) => ({ ...p, cncConfig: { ...p.cncConfig, workpiece: { ...p.cncConfig.workpiece, [key]: value } } }))
  const handleCncResolutionChange = (n: number) => setState((p) => ({ ...p, cncConfig: { ...p.cncConfig, resolution: n } }))

  // ============ 渲染 ============
  return (
    <div className="app">
      <header className="app-header">
        <h1>体素模型编辑器</h1>
        <div className="header-info">
          <span className="badge">
            {state.mode === 'vertex' ? '✏️ 顶点编辑模式' : state.mode === 'voxel' ? '🧊 体素模式' : '🛠️ CNC切削模式'}
          </span>
        </div>
      </header>

      <main className="app-main">
        <div className="canvas-container">
          <Scene
            state={state}
            geometry={editedGeometry}
            vertices={vertices}
            voxelResult={voxelResult}
            onSelectVertex={handleSelectVertex}
            onDragVertex={handleDragVertex}
            onDragEnd={handleDragEnd}
            cncMoves={cncMoves}
          />
          {state.mode === 'voxel' && !voxelResult && (
            <div className="loading-overlay">
              <div className="spinner" />
              <p>正在体素化...</p>
            </div>
          )}
        </div>

        <ControlPanel
          state={state}
          vertexCount={uniqueBaseVertices.length}
          voxelStats={voxelResult?.stats ?? null}
          cncMoves={cncMoves}
          toolLibrary={TOOL_LIBRARY}
          materialLibrary={MATERIAL_LIBRARY}
          examplePrograms={EXAMPLE_PROGRAMS}
          onModeChange={handleModeChange}
          onGeometryTypeChange={handleGeometryTypeChange}
          onDetailChange={handleDetailChange}
          onResetVertices={handleResetVertices}
          onVertexNudge={handleVertexNudge}
          onResolutionChange={handleResolutionChange}
          onShellOnlyToggle={handleShellOnlyToggle}
          onGapChange={handleGapChange}
          onColorGradientToggle={handleColorGradientToggle}
          onRevoxelize={handleRevoxelize}
          onCncPlay={handleCncPlay}
          onCncStop={handleCncStop}
          onCncStepForward={handleCncStepForward}
          onCncStepBack={handleCncStepBack}
          onCncSpeedChange={handleCncSpeedChange}
          onCncScrub={handleCncScrub}
          onProgramSelect={handleProgramSelect}
          onMaterialChange={handleMaterialChange}
          onCncWorkpieceChange={handleCncWorkpieceChange}
          onCncResolutionChange={handleCncResolutionChange}
          onToggleToolpath={handleToggleToolpath}
          onToolOverride={handleToolOverride}
          onToggleWireframe={handleToggleWireframe}
          onToggleVertices={handleToggleVertices}
          onToggleAutoRotate={handleToggleAutoRotate}
          onToggleGrid={handleToggleGrid}
        />
      </main>
    </div>
  )
}

export default App
