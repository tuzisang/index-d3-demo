# Excel血缘关系可视化工具

基于D3.js开发的交互式血缘关系（Lineage）可视化工具，支持从Excel文件构建有向无环图（DAG）。

## 功能特性

- 支持Excel文件导入（.xlsx, .xls）
- 多列血缘关系构建
- 交互式节点操作（点击复制、拖拽移动）
- 动态聚焦关联路径
- 响应式布局适配不同屏幕

## 使用说明

1. **上传Excel文件**
   - 点击上传区域或拖放文件
   - 系统自动解析Sheet1数据

2. **配置血缘列关系**
   - 在控制面板选择起始列
   - 工具支持多列级联关系：
     ```
     W(22) → AN(39) → BE(56) → BV(73) → CM(90) → DD(107) → DV(125)
     ```

3. **交互操作**
   - **点击节点**：复制节点文本到剪贴板
   - **拖拽节点**：调整节点位置
   - **鼠标滚轮**：缩放视图
   - **鼠标悬停**：高亮显示关联路径

4. **技术依赖**
   - [D3.js](https://d3js.org/) - 数据可视化
   - [SheetJS](https://sheetjs.com/) - Excel解析
   - [jQuery](https://jquery.com/) - DOM操作
   - [Select2](https://select2.org/) - 下拉选择器

## 文件结构

```
index-d3-demo/
├── main.html              # 主界面
├── README.md              # 说明文档
└── lib/                   # 依赖库
    ├── d3.v7.min.js       # D3核心库
    ├── xlsx.full.min.js   # SheetJS库
    ├── jquery-3.6.0.min.js
    └── select2/           # Select2组件
```

## 数据格式要求

1. Excel文件需包含表头
2. 血缘关系列索引：
   - W列 → 22
   - AN列 → 39
   - BE列 → 56
   - BV列 → 73
   - CM列 → 90
   - DD列 → 107
   - DV列 → 125
3. 数据从第5行开始解析

## 开发说明

```mermaid
graph TD
    A[上传Excel] --> B[解析数据]
    B --> C[配置列关系]
    C --> D[构建DAG]
    D --> E[可视化渲染]
    E --> F[交互操作]
