import { useState } from 'react'
import type { AppState, GeometryType, AppMode } from '../types'
import type { CutMove, ExampleProgram } from '../lib/toolpathPrograms'
import type { ToolDef, MaterialDef } from '../lib/toolLibrary'

interface ControlPanelProps {
  state: AppState
  /** 当前顶点数量 */
  vertexCount: number
  /** 体素化结果统计 */
  voxelStats: { total: number; solid: number; ratio: number } | null
  /** CNC 刀路 */
  cncMoves: CutMove[]
  /** 刀具库 */
  toolLibrary: ToolDef[]
  /** 材质库 */
  materialLibrary: MaterialDef[]
  /** 示例程序 */
  examplePrograms: ExampleProgram[]
  // 模式切换
  onModeChange: (mode: AppMode) => void
  // 几何体
  onGeometryTypeChange: (type: GeometryType) => void
  onDetailChange: (detail: number) => void
  onResetVertices: () => void
  // 顶点编辑
  onVertexNudge: (axis: 'x' | 'y' | 'z', delta: number) => void
  // 体素
  onResolutionChange: (res: number) => void
  onShellOnlyToggle: () => void
  onGapChange: (gap: number) => void
  onColorGradientToggle: () => void
  onRevoxelize: () => void
  // CNC 回放
  onCncPlay: () => void
  onCncStop: () => void
  onCncStepForward: () => void
  onCncStepBack: () => void
  onCncSpeedChange: (speed: number) => void
  onCncScrub: (progress: number) => void
  onProgramSelect: (programId: string) => void
  onMaterialChange: (materialId: string) => void
  onCncWorkpieceChange: (key: 'width' | 'depth' | 'height', value: number) => void
  onCncResolutionChange: (n: number) => void
  onToggleToolpath: () => void
  onToolOverride: (toolIndex: number) => void
  // 渲染
  onToggleWireframe: () => void
  onToggleVertices: () => void
  onToggleAutoRotate: () => void
  onToggleGrid: () => void
}

const GEO_TYPES: GeometryType[] = ['cube', 'sphere', 'cylinder', 'torus', 'cone']
const GEO_LABELS: Record<GeometryType, string> = {
  cube: '立方体', sphere: '球体', cylinder: '圆柱体', torus: '圆环', cone: '锥体',
}

export default function ControlPanel(props: ControlPanelProps) {
  const { state, vertexCount, voxelStats } = props
  const { mode, geometry, voxelConfig, render, vertexEdit } = state

  // CNC 右侧面板 tab
  const [cncTab, setCncTab] = useState<'program' | 'tool' | 'material' | 'workpiece'>('program')

  return (
    <div className="panel">
      {/* ============ 顶部品牌区 ============ */}
      <div className="panel-brand">
        <div className="brand-logo">⬡</div>
        <div className="brand-text">
          <div className="brand-title"> voxel studio</div>
          <div className="brand-sub">3D Model Editor Pro</div>
        </div>
      </div>

      {/* ============ 模式切换 ============ */}
      <div className="mode-switch-v2">
        <button className={mode === 'vertex' ? 'active' : ''} onClick={() => props.onModeChange('vertex')}>
          <span className="mode-icon">✏</span><span>顶点编辑</span>
        </button>
        <button className={mode === 'voxel' ? 'active' : ''} onClick={() => props.onModeChange('voxel')}>
          <span className="mode-icon">🧊</span><span>体素</span>
        </button>
        <button className={mode === 'cnc' ? 'active' : ''} onClick={() => props.onModeChange('cnc')}>
          <span className="mode-icon">⚙</span><span>CNC</span>
        </button>
      </div>

      {/* ============ CNC 模式 ============ */}
      {mode === 'cnc' && (
        <>
          {/* DRO 数字读数 */}
          <DroDisplay
            moves={props.cncMoves}
            currentIndex={state.playback.currentMoveIndex}
            t={state.playback.currentT}
            workpiece={state.cncConfig.workpiece}
            isCutting={state.cncConfig.isCutting}
            isPlaying={state.playback.isPlaying}
          />

          {/* 时间轴控制 */}
          <TimelineControl
            moves={props.cncMoves}
            currentIndex={state.playback.currentMoveIndex}
            t={state.playback.currentT}
            isPlaying={state.playback.isPlaying}
            speed={state.playback.speed}
            showToolpath={state.playback.showToolpath}
            onPlay={props.onCncPlay}
            onStop={props.onCncStop}
            onStepForward={props.onCncStepForward}
            onStepBack={props.onCncStepBack}
            onSpeedChange={props.onCncSpeedChange}
            onScrub={props.onCncScrub}
            onToggleToolpath={props.onToggleToolpath}
          />

          {/* 右侧属性面板（Tab 切换） */}
          <div className="cnc-tabs">
            <button className={cncTab === 'program' ? 'active' : ''} onClick={() => setCncTab('program')}>刀路</button>
            <button className={cncTab === 'tool' ? 'active' : ''} onClick={() => setCncTab('tool')}>刀具</button>
            <button className={cncTab === 'material' ? 'active' : ''} onClick={() => setCncTab('material')}>材质</button>
            <button className={cncTab === 'workpiece' ? 'active' : ''} onClick={() => setCncTab('workpiece')}>工件</button>
          </div>

          <div className="cnc-tab-content">
            {cncTab === 'program' && (
              <ProgramSelector
                programs={props.examplePrograms}
                selectedId={state.playback.programId}
                onSelect={props.onProgramSelect}
              />
            )}
            {cncTab === 'tool' && (
              <ToolBrowser
                tools={props.toolLibrary}
                currentMove={props.cncMoves[state.playback.currentMoveIndex]}
                toolOverrideIndex={state.playback.toolOverrideIndex}
                onSelect={props.onToolOverride}
              />
            )}
            {cncTab === 'material' && (
              <MaterialSelector
                materials={props.materialLibrary}
                selectedId={state.cncConfig.materialId}
                onSelect={props.onMaterialChange}
              />
            )}
            {cncTab === 'workpiece' && (
              <WorkpieceSettings
                workpiece={state.cncConfig.workpiece}
                resolution={state.cncConfig.resolution}
                onChange={props.onCncWorkpieceChange}
                onResolutionChange={props.onCncResolutionChange}
              />
            )}
          </div>
        </>
      )}

      {/* ============ 顶点编辑模式 ============ */}
      {mode === 'vertex' && (
        <>
          <Section title="几何体">
            <div className="geo-grid">
              {GEO_TYPES.map((t) => (
                <button key={t} className={`geo-btn ${geometry.type === t ? 'active' : ''}`}
                  onClick={() => props.onGeometryTypeChange(t)}>
                  {GEO_LABELS[t]}
                </button>
              ))}
            </div>
            <Slider label="细分度" value={geometry.detail} min={1} max={12} step={1}
              onChange={props.onDetailChange} display={`${geometry.detail}`} />
            <div className="stat-row"><span>顶点数</span><span className="value">{vertexCount}</span></div>
          </Section>

          <Section title="顶点编辑">
            {vertexEdit.selectedIndex >= 0 ? (
              <>
                <p className="selected-info">已选中顶点 #{vertexEdit.selectedIndex}</p>
                <div className="nudge-controls">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <NudgeAxis key={axis} label={axis}
                      onMinus={() => props.onVertexNudge(axis, -0.1)}
                      onPlus={() => props.onVertexNudge(axis, 0.1)} />
                  ))}
                </div>
              </>
            ) : (
              <p className="hint">点击模型上的顶点小球进行选中</p>
            )}
            <button className="action-btn" onClick={props.onResetVertices}>↺ 重置所有顶点</button>
          </Section>
        </>
      )}

      {/* ============ 体素模式 ============ */}
      {mode === 'voxel' && (
        <>
          <Section title="几何体">
            <div className="geo-grid">
              {GEO_TYPES.map((t) => (
                <button key={t} className={`geo-btn ${geometry.type === t ? 'active' : ''}`}
                  onClick={() => props.onGeometryTypeChange(t)}>
                  {GEO_LABELS[t]}
                </button>
              ))}
            </div>
            <Slider label="细分度" value={geometry.detail} min={1} max={12} step={1}
              onChange={props.onDetailChange} display={`${geometry.detail}`} />
          </Section>

          <Section title="体素配置">
            <Slider label="分辨率" value={voxelConfig.resolution} min={4} max={48} step={1}
              onChange={props.onResolutionChange} display={`${voxelConfig.resolution}³`} />
            <Slider label="体素间隙" value={voxelConfig.gap} min={0} max={0.6} step={0.05}
              onChange={props.onGapChange} display={`${(voxelConfig.gap * 100).toFixed(0)}%`} />
            <Toggle label="仅显示外壳" checked={voxelConfig.shellOnly} onChange={props.onShellOnlyToggle} />
            <Toggle label="渐变颜色" checked={voxelConfig.colorGradient} onChange={props.onColorGradientToggle} />
            <button className="action-btn primary" onClick={props.onRevoxelize}>🔄 重新体素化</button>
            {voxelStats && (
              <div className="voxel-stats">
                <div className="stat-row"><span>体素总数</span><span className="value">{voxelStats.solid}</span></div>
                <div className="stat-row"><span>网格单元</span><span className="value">{voxelStats.total.toLocaleString()}</span></div>
                <div className="stat-row"><span>填充率</span><span className="value">{(voxelStats.ratio * 100).toFixed(1)}%</span></div>
              </div>
            )}
          </Section>
        </>
      )}

      {/* ============ 视图选项 ============ */}
      <Section title="视图">
        <Toggle label="显示线框" checked={render.showWireframe} onChange={props.onToggleWireframe} />
        <Toggle label="显示顶点" checked={render.showVertices} onChange={props.onToggleVertices} />
        <Toggle label="自动旋转" checked={render.autoRotate} onChange={props.onToggleAutoRotate} />
        <Toggle label="显示网格" checked={render.showGrid} onChange={props.onToggleGrid} />
      </Section>
    </div>
  )
}

// ===================== DRO 数字读数 =====================

function DroDisplay({ moves, currentIndex, t, workpiece, isCutting, isPlaying }: {
  moves: CutMove[]
  currentIndex: number
  t: number
  workpiece: { width: number; depth: number; height: number }
  isCutting: boolean
  isPlaying: boolean
}) {
  const move = moves[Math.min(currentIndex, moves.length - 1)]
  let x = 0, y = 0, z = 0
  if (move) {
    x = move.from.x + (move.to.x - move.from.x) * t
    y = move.from.y + (move.to.y - move.from.y) * t
    z = move.from.z + (move.to.z - move.from.z) * t
  }

  const spindleRpm = move?.spindleSpeed ?? 0
  const feedRate = move?.feedRate ?? 0
  const progress = moves.length > 0 ? ((currentIndex + t) / moves.length) * 100 : 0

  return (
    <div className="dro-panel">
      <div className="dro-header">
        <span className="dro-label">DIGITAL READOUT</span>
        <div className="dro-status">
          <span className={`status-dot ${isCutting ? 'cutting' : 'idle'}`} />
          <span className="status-text">{isCutting ? '切削中' : isPlaying ? '移动中' : '待机'}</span>
        </div>
      </div>
      <div className="dro-coords">
        <div className="dro-axis">
          <span className="dro-axis-label">X</span>
          <span className="dro-axis-value">{x.toFixed(3)}</span>
          <span className="dro-unit">mm</span>
        </div>
        <div className="dro-axis">
          <span className="dro-axis-label">Y</span>
          <span className="dro-axis-value">{y.toFixed(3)}</span>
          <span className="dro-unit">mm</span>
        </div>
        <div className="dro-axis">
          <span className="dro-axis-label">Z</span>
          <span className="dro-axis-value">{z.toFixed(3)}</span>
          <span className="dro-unit">mm</span>
        </div>
      </div>
      <div className="dro-extra">
        <div className="dro-extra-item">
          <span className="dro-extra-label">主轴</span>
          <span className="dro-extra-value">{spindleRpm.toLocaleString()}</span>
          <span className="dro-extra-unit">RPM</span>
        </div>
        <div className="dro-extra-item">
          <span className="dro-extra-label">进给</span>
          <span className="dro-extra-value">{feedRate}</span>
          <span className="dro-extra-unit">mm/min</span>
        </div>
        <div className="dro-extra-item">
          <span className="dro-extra-label">进度</span>
          <span className="dro-extra-value">{progress.toFixed(1)}</span>
          <span className="dro-extra-unit">%</span>
        </div>
      </div>
    </div>
  )
}

// ===================== 时间轴控制 =====================

function TimelineControl({ moves, currentIndex, t, isPlaying, speed, showToolpath,
  onPlay, onStop, onStepForward, onStepBack, onSpeedChange, onScrub, onToggleToolpath }: {
  moves: CutMove[]
  currentIndex: number
  t: number
  isPlaying: boolean
  speed: number
  showToolpath: boolean
  onPlay: () => void
  onStop: () => void
  onStepForward: () => void
  onStepBack: () => void
  onSpeedChange: (s: number) => void
  onScrub: (progress: number) => void
  onToggleToolpath: () => void
}) {
  const progress = moves.length > 0 ? ((currentIndex + t) / moves.length) * 100 : 0
  const currentMove = moves[Math.min(currentIndex, moves.length - 1)]

  return (
    <div className="timeline-panel">
      <div className="timeline-header">
        <span className="timeline-label">TIMELINE</span>
        <span className="timeline-move-info">
          {currentIndex + 1} / {moves.length}
          {currentMove && <span className="move-type-badge type-{currentMove.type}">{currentMove.type}</span>}
        </span>
      </div>

      {/* 进度条 */}
      <div className="timeline-bar-container">
        <div className="timeline-bar-bg">
          <div className="timeline-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <input
          type="range"
          className="timeline-scrubber"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={(e) => onScrub(parseFloat(e.target.value) / 100)}
        />
      </div>

      {/* 控制按钮 */}
      <div className="timeline-controls">
        <button className="tl-btn" onClick={onStepBack} title="上一步">⏮</button>
        <button className={`tl-btn primary ${isPlaying ? 'playing' : ''}`} onClick={onPlay} title="播放/暂停">
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="tl-btn" onClick={onStepForward} title="下一步">⏭</button>
        <button className="tl-btn" onClick={onStop} title="停止">⏹</button>
      </div>

      {/* 速度控制 */}
      <div className="timeline-speed">
        <span className="speed-label">速度</span>
        {[0.5, 1, 2, 5].map((s) => (
          <button key={s} className={`speed-btn ${speed === s ? 'active' : ''}`}
            onClick={() => onSpeedChange(s)}>
            {s}×
          </button>
        ))}
        <button className={`speed-btn toolpath-toggle ${showToolpath ? 'active' : ''}`}
          onClick={onToggleToolpath} title="切换刀路线显示">
          ✐ 刀路
        </button>
      </div>
    </div>
  )
}

// ===================== 程序选择器 =====================

function ProgramSelector({ programs, selectedId, onSelect }: {
  programs: ExampleProgram[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="program-list">
      {programs.map((p) => (
        <button key={p.id} className={`program-card ${selectedId === p.id ? 'active' : ''}`}
          onClick={() => onSelect(p.id)}>
          <div className="program-card-header">
            <span className="program-name">{p.name}</span>
            <span className="program-cat">{p.category}</span>
          </div>
          <span className="program-desc">{p.description}</span>
        </button>
      ))}
    </div>
  )
}

// ===================== 刀具浏览器 =====================

function ToolBrowser({ tools, currentMove, toolOverrideIndex, onSelect }: {
  tools: ToolDef[]
  currentMove?: CutMove
  toolOverrideIndex: number
  onSelect: (toolIndex: number) => void
}) {
  const programTool = currentMove?.tool
  return (
    <div className="tool-browser">
      {tools.map((t, i) => {
        const isOverridden = toolOverrideIndex === i
        const isProgramTool = toolOverrideIndex < 0 && programTool?.name === t.name
        const isActive = isOverridden || isProgramTool
        return (
          <div key={i}
            className={`tool-card ${isActive ? 'active' : ''} clickable`}
            onClick={() => onSelect(i)}
          >
            <div className="tool-icon" style={{ background: t.color }}>
              {t.type === 'end_mill' ? '⬛' : t.type === 'ball_nose' ? '⬤' : '▼'}
            </div>
            <div className="tool-info">
              <span className="tool-name">{t.name}</span>
              <span className="tool-desc">{t.description}</span>
              <div className="tool-specs">
                <span>Ø{t.diameter}</span>
                <span>L{t.length}</span>
                <span>{t.flutes}刃</span>
              </div>
            </div>
            {isActive && <span className="tool-active-badge">{isOverridden ? '已选' : '使用中'}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ===================== 材质选择器 =====================

function MaterialSelector({ materials, selectedId, onSelect }: {
  materials: MaterialDef[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="material-grid">
      {materials.map((m) => (
        <button key={m.id} className={`material-card ${selectedId === m.id ? 'active' : ''}`}
          onClick={() => onSelect(m.id)}>
          <div className="material-swatch" style={{
            background: `linear-gradient(135deg, ${m.color}, ${m.sideColor})`,
            boxShadow: `0 2px 8px ${m.color}40`,
          }} />
          <span className="material-name">{m.name}</span>
        </button>
      ))}
    </div>
  )
}

// ===================== 工件设置 =====================

function WorkpieceSettings({ workpiece, resolution, onChange, onResolutionChange }: {
  workpiece: { width: number; depth: number; height: number }
  resolution: number
  onChange: (key: 'width' | 'depth' | 'height', value: number) => void
  onResolutionChange: (n: number) => void
}) {
  return (
    <div className="workpiece-settings">
      <Slider label="宽度 (X)" value={workpiece.width} min={2} max={20} step={0.5}
        onChange={(v) => onChange('width', v)} display={`${workpiece.width}mm`} />
      <Slider label="深度 (Z)" value={workpiece.depth} min={2} max={20} step={0.5}
        onChange={(v) => onChange('depth', v)} display={`${workpiece.depth}mm`} />
      <Slider label="厚度 (Y)" value={workpiece.height} min={1} max={10} step={0.5}
        onChange={(v) => onChange('height', v)} display={`${workpiece.height}mm`} />
      <Slider label="网格分辨率" value={resolution} min={20} max={150} step={5}
        onChange={onResolutionChange} display={`${resolution}×${resolution}`} />
    </div>
  )
}

// ============ 子组件 ============

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, display }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display: string
}) {
  return (
    <div className="slider-row">
      <div className="slider-header">
        <label>{label}</label>
        <span className="slider-value">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

function Toggle({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="toggle-row" onClick={onChange}>
      <span>{label}</span>
      <div className={`toggle ${checked ? 'on' : ''}`}>
        <div className="toggle-knob" />
      </div>
    </div>
  )
}

function NudgeAxis({ label, onMinus, onPlus }: {
  label: string
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="nudge-axis">
      <span className="axis-label">{label}</span>
      <button onClick={onMinus}>−</button>
      <button onClick={onPlus}>+</button>
    </div>
  )
}
