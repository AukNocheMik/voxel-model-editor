import type { AppState, GeometryType, AppMode, ToolType } from '../types'

interface ControlPanelProps {
  state: AppState
  /** 当前顶点数量 */
  vertexCount: number
  /** 体素化结果统计 */
  voxelStats: { total: number; solid: number; ratio: number } | null
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
  // CNC
  onCncWorkpieceChange: (key: 'width' | 'depth' | 'height', value: number) => void
  onCncToolTypeChange: (type: ToolType) => void
  onCncToolDiameterChange: (d: number) => void
  onCncCutDepthChange: (d: number) => void
  onCncResolutionChange: (n: number) => void
  onCncReset: () => void
  onCncPreset: (type: 'hole' | 'pocket' | 'circle') => void
  // 渲染
  onToggleWireframe: () => void
  onToggleVertices: () => void
  onToggleAutoRotate: () => void
  onToggleGrid: () => void
}

const GEO_TYPES: GeometryType[] = ['cube', 'sphere', 'cylinder', 'torus', 'cone']

const GEO_LABELS: Record<GeometryType, string> = {
  cube: '立方体',
  sphere: '球体',
  cylinder: '圆柱体',
  torus: '圆环',
  cone: '锥体',
}

export default function ControlPanel(props: ControlPanelProps) {
  const { state, vertexCount, voxelStats } = props
  const { mode, geometry, voxelConfig, render, vertexEdit } = state

  return (
    <div className="panel">
      {/* ============ 模式切换 ============ */}
      <Section title="模式 Mode">
        <div className="mode-switch">
          <button
            className={mode === 'vertex' ? 'active' : ''}
            onClick={() => props.onModeChange('vertex')}
          >
            ✏️ 顶点编辑
          </button>
          <button
            className={mode === 'voxel' ? 'active' : ''}
            onClick={() => props.onModeChange('voxel')}
          >
            🧊 体素表现
          </button>
          <button
            className={mode === 'cnc' ? 'active' : ''}
            onClick={() => props.onModeChange('cnc')}
          >
            🛠️ CNC切削
          </button>
        </div>
        <p className="hint">
          {mode === 'vertex'
            ? '拖拽顶点小球来变形模型，编辑后切换到体素模式可查看体素化效果'
            : mode === 'voxel'
            ? '将模型转换为体素方块，这是 CNC 切削模拟的基础（本阶段仅可视化）'
            : '在工件上按住鼠标左键拖动即可切削，刀具会跟随鼠标移动并切除材料'}
        </p>
      </Section>

      {/* ============ 几何体选择（仅顶点/体素模式） ============ */}
      {(mode === 'vertex' || mode === 'voxel') && (
      <Section title="几何体 Geometry">
        <div className="geo-grid">
          {GEO_TYPES.map((t) => (
            <button
              key={t}
              className={`geo-btn ${geometry.type === t ? 'active' : ''}`}
              onClick={() => props.onGeometryTypeChange(t)}
            >
              {GEO_LABELS[t]}
            </button>
          ))}
        </div>
        <Slider
          label="细分度 (顶点密度)"
          value={geometry.detail}
          min={1}
          max={12}
          step={1}
          onChange={props.onDetailChange}
          display={`${geometry.detail}`}
        />
        <div className="stat-row">
          <span>顶点数</span>
          <span className="value">{vertexCount}</span>
        </div>
      </Section>
      )}

      {/* ============ CNC 切削控制 ============ */}
      {mode === 'cnc' && (
        <Section title="工件 Workpiece">
          <Slider
            label="宽度 (X)"
            value={state.cncConfig.workpiece.width}
            min={2}
            max={20}
            step={0.5}
            onChange={(v) => props.onCncWorkpieceChange('width', v)}
            display={`${state.cncConfig.workpiece.width}`}
          />
          <Slider
            label="深度 (Z)"
            value={state.cncConfig.workpiece.depth}
            min={2}
            max={20}
            step={0.5}
            onChange={(v) => props.onCncWorkpieceChange('depth', v)}
            display={`${state.cncConfig.workpiece.depth}`}
          />
          <Slider
            label="厚度 (Y)"
            value={state.cncConfig.workpiece.height}
            min={1}
            max={10}
            step={0.5}
            onChange={(v) => props.onCncWorkpieceChange('height', v)}
            display={`${state.cncConfig.workpiece.height}`}
          />
          <Slider
            label="网格分辨率"
            value={state.cncConfig.resolution}
            min={20}
            max={150}
            step={5}
            onChange={props.onCncResolutionChange}
            display={`${state.cncConfig.resolution}×${state.cncConfig.resolution}`}
          />
        </Section>
      )}

      {mode === 'cnc' && (
        <Section title="刀具 Tool">
          <div className="geo-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {([
              ['end_mill', '端铣刀'],
              ['ball_nose', '球刀'],
              ['drill', '钻头'],
            ] as [ToolType, string][]).map(([t, label]) => (
              <button
                key={t}
                className={`geo-btn ${state.cncConfig.tool.type === t ? 'active' : ''}`}
                onClick={() => props.onCncToolTypeChange(t)}
              >
                {label}
              </button>
            ))}
          </div>
          <Slider
            label="刀具直径"
            value={state.cncConfig.tool.diameter}
            min={0.5}
            max={4}
            step={0.1}
            onChange={props.onCncToolDiameterChange}
            display={`Ø${state.cncConfig.tool.diameter.toFixed(1)}`}
          />
          <Slider
            label="切削深度"
            value={-state.cncConfig.tool.cutDepth}
            min={0}
            max={state.cncConfig.workpiece.height}
            step={0.1}
            onChange={(v) => props.onCncCutDepthChange(-v)}
            display={`${(-state.cncConfig.tool.cutDepth).toFixed(1)}mm`}
          />
        </Section>
      )}

      {mode === 'cnc' && (
        <Section title="切削操作 Cutting">
          <p className="hint">按住鼠标左键在工件上拖动即可切削</p>
          <div className="preset-grid">
            <button className="action-btn" onClick={() => props.onCncPreset('hole')}>
              ⭕ 打孔
            </button>
            <button className="action-btn" onClick={() => props.onCncPreset('pocket')}>
              ▭ 挖槽
            </button>
            <button className="action-btn" onClick={() => props.onCncPreset('circle')}>
              ◎ 圆环
            </button>
          </div>
          <button className="action-btn primary" onClick={props.onCncReset}>
            ↺ 重置工件
          </button>
        </Section>
      )}

      {/* ============ 顶点编辑控制 ============ */}
      {mode === 'vertex' && (
        <Section title="顶点编辑 Vertex Edit">
          {vertexEdit.selectedIndex >= 0 ? (
            <>
              <p className="selected-info">
                已选中顶点 #{vertexEdit.selectedIndex}
              </p>
              <div className="nudge-controls">
                <NudgeAxis
                  label="X"
                  onMinus={() => props.onVertexNudge('x', -0.1)}
                  onPlus={() => props.onVertexNudge('x', 0.1)}
                />
                <NudgeAxis
                  label="Y"
                  onMinus={() => props.onVertexNudge('y', -0.1)}
                  onPlus={() => props.onVertexNudge('y', 0.1)}
                />
                <NudgeAxis
                  label="Z"
                  onMinus={() => props.onVertexNudge('z', -0.1)}
                  onPlus={() => props.onVertexNudge('z', 0.1)}
                />
              </div>
            </>
          ) : (
            <p className="hint">点击模型上的顶点小球进行选中</p>
          )}
          <button className="action-btn" onClick={props.onResetVertices}>
            ↺ 重置所有顶点
          </button>
        </Section>
      )}

      {/* ============ 体素控制 ============ */}
      {mode === 'voxel' && (
        <Section title="体素配置 Voxel Config">
          <Slider
            label="分辨率 (每轴体素数)"
            value={voxelConfig.resolution}
            min={4}
            max={48}
            step={1}
            onChange={props.onResolutionChange}
            display={`${voxelConfig.resolution}³`}
          />
          <Slider
            label="体素间隙"
            value={voxelConfig.gap}
            min={0}
            max={0.6}
            step={0.05}
            onChange={props.onGapChange}
            display={`${(voxelConfig.gap * 100).toFixed(0)}%`}
          />
          <Toggle
            label="仅显示外壳"
            checked={voxelConfig.shellOnly}
            onChange={props.onShellOnlyToggle}
          />
          <Toggle
            label="渐变颜色"
            checked={voxelConfig.colorGradient}
            onChange={props.onColorGradientToggle}
          />
          <button className="action-btn primary" onClick={props.onRevoxelize}>
            🔄 重新体素化
          </button>
          {voxelStats && (
            <div className="voxel-stats">
              <div className="stat-row">
                <span>体素总数</span>
                <span className="value">{voxelStats.solid}</span>
              </div>
              <div className="stat-row">
                <span>网格单元</span>
                <span className="value">{voxelStats.total.toLocaleString()}</span>
              </div>
              <div className="stat-row">
                <span>填充率</span>
                <span className="value">
                  {(voxelStats.ratio * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ============ 渲染选项 ============ */}
      <Section title="视图 View">
        <Toggle label="显示线框" checked={render.showWireframe} onChange={props.onToggleWireframe} />
        <Toggle label="显示顶点" checked={render.showVertices} onChange={props.onToggleVertices} />
        <Toggle label="自动旋转" checked={render.autoRotate} onChange={props.onToggleAutoRotate} />
        <Toggle label="显示网格" checked={render.showGrid} onChange={props.onToggleGrid} />
      </Section>
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

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
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

function NudgeAxis({
  label,
  onMinus,
  onPlus,
}: {
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
