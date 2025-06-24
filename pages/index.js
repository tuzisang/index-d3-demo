import Head from 'next/head'
import Script from 'next/script'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

// 定义常量，避免在每次渲染时重复创建
const COLUMN_CHAIN = [22, 39, 56, 73, 90, 107, 125]
const COLUMN_MAP = {
  22: 'W', 39: 'AN', 56: 'BE', 73: 'BV',
  90: 'CM', 107: 'DD', 125: 'DV'
}

// 定义 Cytoscape 内部使用的颜色常量，不再使用 CSS 变量
const CY_NODE_COLOR = '#4FC3F7' // 浅蓝色
const CY_EDGE_COLOR = '#90A4AE' // 柔和的灰色
const CY_HIGHLIGHT_NODE_BG = '#FFEB3B' // 亮黄色（祖先）
const CY_HIGHLIGHT_NODE_BORDER = '#FFC107' // 橙黄色
const CY_HIGHLIGHT_EDGE_COLOR = '#FF5722' // 橙红色
const CY_EDGEHANDLE_COLOR = '#FF5722' // 橙红色
// 新增高亮色
const CY_CURRENT_NODE_COLOR = '#2196F3' // 当前节点蓝色
const CY_DESCENDANT_NODE_BG = '#4CAF50' // 子孙绿色
const CY_DESCENDANT_EDGE_COLOR = '#388E3C' // 子孙边绿色

export default function Home() {
  const cyRef = useRef(null) // 使用 useRef 存储 Cytoscape 实例
  const fileInputRef = useRef(null); // 用于直接操作文件输入框
  const [isLoading, setIsLoading] = useState(false) // 加载状态
  const [uploadedFileName, setUploadedFileName] = useState('未选择文件') // 上传文件名状态
  // 新增：多选支持
  const [selectedNodes, setSelectedNodes] = useState([])
  // 新增：高亮更新函数引用
  const updateMultiHighlightRef = useRef(null)
  // 搜索相关
  const [searchValue, setSearchValue] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1)

  // 提示消息函数
  const showToast = useCallback((message, isError = false) => {
    const toast = document.getElementById('toast-message')
    if (!toast) return;
    toast.textContent = message
    toast.className = 'toast show'
    if (isError) {
      toast.classList.add('error')
    } else {
      toast.classList.remove('error')
    }

    setTimeout(() => {
      toast.className = 'toast'
    }, 3000)
  }, [])

  // 重置视图函数
  const resetZoom = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animation({
        fit: {
          eles: cyRef.current.elements(),
          padding: 50
        },
        duration: 750
      }).play()
    } else {
      showToast('图表未加载，无法重置视图。', true)
    }
  }, [showToast])

  // 下载图片函数
  const downloadImage = useCallback(() => {
    if (!cyRef.current) {
      showToast('请先上传Excel文件生成图表！', true)
      return
    }

    // 移除高亮，确保图片干净
    cyRef.current.elements().removeClass('highlighted-node highlighted-edge')

    const image = cyRef.current.png({
      full: true,
      bg: '#FFFFFF',
      scale: 2
    })

    const a = document.createElement('a')
    a.href = image
    // 使用 uploadedFileName 命名，并移除可能的 Excel 后缀，确保下载的是当前图表
    a.download = uploadedFileName.replace(/\.(xlsx|xls)$/i, '') + '.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showToast('图片已下载！')
  }, [cyRef, uploadedFileName, showToast])

  // 获取上游路径函数
  const getUpstreamPath = useCallback((startNode) => {
    const pathNodes = new Set()
    const pathEdges = new Set()
    const queue = [startNode]

    pathNodes.add(startNode.id())

    let head = 0
    while(head < queue.length) {
      const currentNode = queue[head++]
      const incomingEdges = currentNode.incomers('edge')
      
      incomingEdges.forEach(edge => {
        const sourceNode = edge.source()
        if (!pathNodes.has(sourceNode.id())) {
          pathNodes.add(sourceNode.id())
          queue.push(sourceNode)
        }
        pathEdges.add(edge.id())
      })
    }
    
    const collectedNodes = cyRef.current.collection(Array.from(pathNodes).map(id => cyRef.current.getElementById(id)))
    collectedNodes.edgesWith(collectedNodes).forEach(edge => pathEdges.add(edge.id()))

    const nodesCollection = cyRef.current.collection(Array.from(pathNodes).map(id => cyRef.current.getElementById(id)))
    const edgesCollection = cyRef.current.collection(Array.from(pathEdges).map(id => cyRef.current.getElementById(id)))

    return nodesCollection.union(edgesCollection)
  }, [cyRef])

  // 获取下游路径函数
  const getDownstreamPath = useCallback((startNode) => {
    const pathNodes = new Set()
    const pathEdges = new Set()
    const queue = [startNode]

    pathNodes.add(startNode.id())

    let head = 0
    while(head < queue.length) {
      const currentNode = queue[head++]
      const outgoingEdges = currentNode.outgoers('edge')
      
      outgoingEdges.forEach(edge => {
        const targetNode = edge.target()
        if (!pathNodes.has(targetNode.id())) {
          pathNodes.add(targetNode.id())
          queue.push(targetNode)
        }
        pathEdges.add(edge.id())
      })
    }
    
    const collectedNodes = cyRef.current.collection(Array.from(pathNodes).map(id => cyRef.current.getElementById(id)))
    collectedNodes.edgesWith(collectedNodes).forEach(edge => pathEdges.add(edge.id()))

    const nodesCollection = cyRef.current.collection(Array.from(pathNodes).map(id => cyRef.current.getElementById(id)))
    const edgesCollection = cyRef.current.collection(Array.from(pathEdges).map(id => cyRef.current.getElementById(id)))

    return nodesCollection.union(edgesCollection)
  }, [cyRef])

  // 生成DAG图函数
  const generateDAG = useCallback((data) => {
    const container = document.getElementById('cy')
    if (!container) {
      showToast('图表容器未找到，请检查HTML结构。', true)
      return
    }

    // 如果已经有实例，先销毁
    if (cyRef.current) {
      cyRef.current.destroy()
      cyRef.current = null; // 清空引用
    }

    cyRef.current = window.cytoscape({
      container: container,
      elements: [],
      // 优化：滚轮缩放速度
      wheelSensitivity: 0.2, // 降低滚轮缩放灵敏度，使其更平滑
      style: [
        {
          selector: 'node[label]',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'right',
            'text-margin-x': 10,
            'width': 15,
            'height': 15,
            'background-color': CY_NODE_COLOR,
            'border-color': CY_NODE_COLOR,
            'border-width': 1,
            'font-size': '10px',
            'color': '#333', // 节点文字颜色
            'text-outline-color': '#fff',
            'text-outline-width': '0px',
            'text-wrap': 'wrap', // 允许文本换行
            'text-max-width': '80px' // 限制文本最大宽度
          }
        },
        {
          selector: 'node:not([label])',
          style: {
            'width': 15,
            'height': 15,
            'background-color': CY_NODE_COLOR,
            'border-color': CY_NODE_COLOR,
            'border-width': 1
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': CY_EDGE_COLOR,
            'target-arrow-color': CY_EDGE_COLOR,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'source-endpoint': 'outside-to-node',
            'target-endpoint': 'outside-to-node'
          }
        },
        {
          selector: '.highlighted-current',
          style: {
            'background-color': CY_CURRENT_NODE_COLOR,
            'border-color': CY_CURRENT_NODE_COLOR,
            'border-width': 3,
            'color': '#333', // 当前节点文字深色
            'font-size': '14px', // 字体变大
            'z-index': 10000
          }
        },
        {
          selector: '.highlighted-ancestor',
          style: {
            'background-color': CY_HIGHLIGHT_NODE_BG,
            'border-color': CY_HIGHLIGHT_NODE_BORDER,
            'border-width': 2,
            'color': '#333', // 祖先节点文字深色
            'font-size': '14px', // 字体变大
            'z-index': 9999
          }
        },
        {
          selector: '.highlighted-descendant',
          style: {
            'background-color': CY_DESCENDANT_NODE_BG,
            'border-color': CY_DESCENDANT_NODE_BG,
            'border-width': 2,
            'color': '#333', // 子孙节点文字深色
            'font-size': '14px', // 字体变大
            'z-index': 9998
          }
        },
        {
          selector: '.highlighted-edge-ancestor',
          style: {
            'line-color': CY_HIGHLIGHT_EDGE_COLOR,
            'target-arrow-color': CY_HIGHLIGHT_EDGE_COLOR,
            'width': 2,
            'z-index': 9997
          }
        },
        {
          selector: '.highlighted-edge-descendant',
          style: {
            'line-color': CY_DESCENDANT_EDGE_COLOR,
            'target-arrow-color': CY_DESCENDANT_EDGE_COLOR,
            'width': 2,
            'z-index': 9996
          }
        }
      ]
    })

    // 检查并注册 edgehandles 扩展
    if (typeof cyRef.current.edgehandles === 'function') {
      cyRef.current.edgehandles({
        handleSize: 10,
        handleColor: CY_EDGEHANDLE_COLOR,
        hoverDelay: 150,
        snap: true,
        snapThreshold: 20,
        snapFrequency: 15,
        noEdgeEventsInDraw: true,
        disableBrowserGestures: true
      })
    } else {
      console.error('Edgehandles扩展未正确加载。请检查脚本引入。')
      showToast('Edgehandles扩展未加载，部分功能可能受限。', true)
    }

    const nodes = []
    const edges = []
    const nodeMap = new Map()

    const rootValues = new Set()
    for (let i = 4; i < data.length; i++) {
      if (data[i] && data[i][22]) {
        let value = String(data[i][22])
        value = value.toLowerCase().trim() // 增加trim
        if (value && value !== '/') rootValues.add(value)
      }
    }

    rootValues.forEach(value => {
      const rootId = `root_${value}`
      if (!nodeMap.has(rootId)) {
        nodes.push({
          group: 'nodes',
          data: {
            id: rootId,
            label: value,
            color: CY_NODE_COLOR
          }
        })
        nodeMap.set(rootId, true)
      }

      for (let i = 4; i < data.length; i++) {
        if (data[i] && String(data[i][22]).toLowerCase().trim() === value) {
          let parentId = rootId

          for (let j = 1; j < COLUMN_CHAIN.length; j++) {
            const colIndex = COLUMN_CHAIN[j]
            let colName = COLUMN_MAP[colIndex]
            let cellValue = data[i][colIndex]
            cellValue = String(cellValue).toLowerCase().trim()

            if (cellValue === 'undefined' || cellValue === '/') continue

            const nodeId = `${colName}_${cellValue}`
            if (!nodeMap.has(nodeId)) {
              nodes.push({
                group: 'nodes',
                data: {
                  id: nodeId,
                  label: cellValue,
                  color: CY_NODE_COLOR
                }
              })
              nodeMap.set(nodeId, true)
            }

            const edgeId = `${parentId}-${nodeId}`
            if (!edges.some(edge => edge.data.id === edgeId)) {
              edges.push({
                group: 'edges',
                data: {
                  id: edgeId,
                  source: parentId,
                  target: nodeId
                }
              })
            }
            parentId = nodeId
          }
        }
      }
    })

    cyRef.current.add(nodes.concat(edges))

    const layout = cyRef.current.layout({
      name: 'dagre',
      rankDir: 'RL', // 从右到左布局
      rankSep: 350,
      nodeSep: 30,
      edgeSep: 10,
      fit: true,
      padding: 50,
      animate: true,
      animationDuration: 500,
      animationEasing: 'ease-out',
    })
    layout.run()

    cyRef.current.fit(cyRef.current.elements(), 50)

    let lastHighlightedElements = cyRef.current.collection()

    // 新增：多选高亮逻辑，始终用 useRef 指向最新实现
    updateMultiHighlightRef.current = (selectedNodeIds) => {
      if (!cyRef.current) return;
      cyRef.current.elements().removeClass('highlighted-current highlighted-ancestor highlighted-descendant highlighted-edge-ancestor highlighted-edge-descendant')
      if (!selectedNodeIds.length) return;
      const allAncestors = new Set()
      const allDescendants = new Set()
      const allAncestorEdges = new Set()
      const allDescendantEdges = new Set()
      selectedNodeIds.forEach(id => {
        const node = cyRef.current.getElementById(id)
        const up = getUpstreamPath(node)
        up.nodes().forEach(n => { if (n.id() !== id) allAncestors.add(n.id()) })
        up.edges().forEach(e => allAncestorEdges.add(e.id()))
        const down = getDownstreamPath(node)
        down.nodes().forEach(n => { if (n.id() !== id) allDescendants.add(n.id()) })
        down.edges().forEach(e => allDescendantEdges.add(e.id()))
      })
      selectedNodeIds.forEach(id => {
        const node = cyRef.current.getElementById(id)
        node.addClass('highlighted-current')
      })
      Array.from(allAncestors).forEach(id => {
        if (!selectedNodeIds.includes(id)) cyRef.current.getElementById(id).addClass('highlighted-ancestor')
      })
      Array.from(allAncestorEdges).forEach(id => {
        cyRef.current.getElementById(id).addClass('highlighted-edge-ancestor')
      })
      Array.from(allDescendants).forEach(id => {
        if (!selectedNodeIds.includes(id) && !allAncestors.has(id)) cyRef.current.getElementById(id).addClass('highlighted-descendant')
      })
      Array.from(allDescendantEdges).forEach(id => {
        if (!allAncestorEdges.has(id)) cyRef.current.getElementById(id).addClass('highlighted-edge-descendant')
      })
    }

    // 节点点击事件
    cyRef.current.on('tap', 'node', function(evt){
      const node = evt.target
      const nodeLabel = node.data('label')
      const nodeId = node.id()
      // 检查 Ctrl 是否按下
      const isCtrl = evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey)
      setSelectedNodes(prev => {
        let next
        if (isCtrl) {
          // 多选
          if (prev.includes(nodeId)) {
            next = prev.filter(id => id !== nodeId)
          } else {
            next = [...prev, nodeId]
          }
        } else {
          // 单选
          if (prev.length === 1 && prev[0] === nodeId) {
            next = []
          } else {
            next = [nodeId]
          }
        }
        setTimeout(() => updateMultiHighlightRef.current(next), 0)
        return next
      })
      // 复制到剪贴板逻辑（只复制最后点击的）
      if (nodeLabel) {
        navigator.clipboard.writeText(nodeLabel)
          .then(() => {
            showToast(`'${nodeLabel}' 已复制到剪贴板！`)
          })
          .catch(err => {
            console.error('复制失败:', err)
            showToast('复制失败，请手动复制。', true)
          })
      } else {
        showToast('节点名称为空，无法复制。', true)
      }
    })

    // 背景点击事件，取消所有高亮
    cyRef.current.on('tap', function(evt){
      if(evt.target === cyRef.current) {
        setSelectedNodes([])
        cyRef.current.elements().removeClass('highlighted-current highlighted-ancestor highlighted-descendant highlighted-edge-ancestor highlighted-edge-descendant')
      }
    })
  }, [cyRef, showToast, getUpstreamPath, getDownstreamPath])

  // 文件处理函数
  const handleFile = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) {
      setUploadedFileName('未选择文件'); // 用户取消选择时重置
      // 确保文件输入框的值被清空，以便再次选择相同文件时能触发 change 事件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsLoading(true) // 开始加载
    setUploadedFileName(file.name) // 设置当前上传的文件名

    const reader = new FileReader()
    reader.onload = function (e) {
      try {
        // 确保XLSX库已加载
        if (typeof window.XLSX === 'undefined') {
          throw new Error('XLSX库未加载');
        }
        const data = new Uint8Array(e.target.result)
        const workbook = window.XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        generateDAG(jsonData)
        showToast('图表生成成功！')
      } catch (error) {
        console.error('文件读取或解析失败:', error)
        showToast(`文件读取或解析失败: ${error.message}`, true)
        setUploadedFileName('文件解析失败'); // 错误时更新文件名状态
      } finally {
        setIsLoading(false) // 结束加载
        // 确保文件输入框的值被清空，以便再次选择相同文件时能触发 change 事件
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
    reader.onerror = (error) => {
      console.error('FileReader error:', error)
      showToast('文件读取失败，请重试。', true)
      setIsLoading(false)
      setUploadedFileName('文件读取失败'); // 错误时更新文件名状态
      // 确保文件输入框的值被清空
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    reader.readAsArrayBuffer(file)
  }, [generateDAG, showToast])

  // useEffect 负责初始化事件监听器和库检查
  useEffect(() => {
    // 确保所有必要的库都已加载
    // 使用 setTimeout 稍微延迟，确保所有 <Script> 标签有机会加载
    const checkLibs = () => {
      if (typeof window === 'undefined' || !window.XLSX || !window.cytoscape || !window.cytoscapeDagre) {
        console.warn('Cytoscape 或 XLSX 库未完全加载，正在重试...')
        setTimeout(checkLibs, 200); // 200ms 后重试
        return;
      }

      console.log('所有库已加载。')

      // 注册 dagre 布局，确保只注册一次
      if (!window.cytoscape.prototype.hasDagreLayout) {
        window.cytoscape.use(window.cytoscapeDagre)
        window.cytoscape.prototype.hasDagreLayout = true; // 标记已注册
        console.log('Cytoscape Dagre 布局已注册。')
      }

      // 绑定事件监听器
      // 使用 ref 获取 DOM 元素，确保在组件生命周期内稳定
      const currentFileInput = fileInputRef.current;
      const resetZoomBtn = document.getElementById('reset-zoom');
      const downloadImageBtn = document.getElementById('download-image');

      // 确保事件监听器只添加一次，并使用 useCallback 包装的函数
      // React 18 的 StrictMode 会在开发模式下双重渲染 useEffect，导致事件重复绑定
      // 最佳实践是让 useEffect 的清理函数负责移除监听器，并确保依赖项正确
      // 这里我们直接使用 React 的事件处理，而不是手动 addEventListener
      // 但由于你使用了 ID 获取 DOM 并手动绑定，需要确保移除旧的
      if (currentFileInput) {
        currentFileInput.removeEventListener('change', handleFile); // 移除旧的
        currentFileInput.addEventListener('change', handleFile); // 添加新的
      }
      if (resetZoomBtn) {
        resetZoomBtn.removeEventListener('click', resetZoom);
        resetZoomBtn.addEventListener('click', resetZoom);
      }
      if (downloadImageBtn) {
        downloadImageBtn.removeEventListener('click', downloadImage);
        downloadImageBtn.addEventListener('click', downloadImage);
      }

      // 新增：监听窗口大小变化，并通知 Cytoscape 重新布局
      const handleResize = () => {
        if (cyRef.current) {
          cyRef.current.resize(); // 通知 Cytoscape 容器大小已改变
          // 可以在这里选择是否重新fit图表，如果布局变化大可以加上
          // cyRef.current.fit(cyRef.current.elements(), 50); 
        }
      };
      window.addEventListener('resize', handleResize);
      
      // 清理函数：在组件卸载时移除事件监听器和销毁 Cytoscape 实例
      return () => {
        // 使用 ref 获取 DOM 元素进行清理
        const currentFileInput = fileInputRef.current;
        const resetZoomBtn = document.getElementById('reset-zoom');
        const downloadImageBtn = document.getElementById('download-image');

        if (currentFileInput) currentFileInput.removeEventListener('change', handleFile)
        if (resetZoomBtn) resetZoomBtn.removeEventListener('click', resetZoom)
        if (downloadImageBtn) downloadImageBtn.removeEventListener('click', downloadImage)
        window.removeEventListener('resize', handleResize); // 移除 resize 监听器
        if (cyRef.current) {
          cyRef.current.destroy()
          cyRef.current = null;
        }
      }
    };

    checkLibs(); // 首次检查
  }, [handleFile, resetZoom, downloadImage]) // 依赖项确保回调函数是最新的

  // 监听 selectedNodes 变化，自动高亮
  useEffect(() => {
    if (cyRef.current && updateMultiHighlightRef.current) {
      updateMultiHighlightRef.current(selectedNodes)
    }
  }, [selectedNodes])

  // 获取所有节点label和id
  const allNodeOptions = useMemo(() => {
    if (!cyRef.current) return [];
    return cyRef.current.nodes().map(n => ({
      id: n.id(),
      label: n.data('label') || n.id()
    })).filter(n => n.label && n.label !== '/');
  }, [isLoading, uploadedFileName]);

  // 简单拼音/模糊匹配（可扩展更强大算法）
  const fuzzyMatch = (input, label) => {
    if (!input) return false;
    return label.toLowerCase().includes(input.toLowerCase());
  };

  // 搜索输入变化
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchValue(val);
    if (!val) {
      setSearchResults([]);
      setShowDropdown(false);
      setSearchActiveIndex(-1);
      return;
    }
    const results = allNodeOptions.filter(opt => fuzzyMatch(val, opt.label));
    setSearchResults(results.slice(0, 10)); // 最多10条
    setShowDropdown(true);
    setSearchActiveIndex(-1);
  };

  // 选中某个搜索建议
  const handleSelectNode = (nodeId) => {
    setSearchValue('');
    setSearchResults([]);
    setShowDropdown(false);
    setSearchActiveIndex(-1);
    // 复用高亮逻辑，单选该节点
    setSelectedNodes([nodeId]);
    // 滚动到该节点（可选）
    setTimeout(() => {
      if (cyRef.current) {
        const node = cyRef.current.getElementById(nodeId);
        if (node) cyRef.current.center(node);
      }
    }, 200);
  };

  // 键盘上下选择
  const handleSearchKeyDown = (e) => {
    if (!showDropdown || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      setSearchActiveIndex(idx => Math.min(idx + 1, searchResults.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setSearchActiveIndex(idx => Math.max(idx - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (searchActiveIndex >= 0 && searchActiveIndex < searchResults.length) {
        handleSelectNode(searchResults[searchActiveIndex].id);
      }
    }
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const close = (e) => {
      setShowDropdown(false);
    };
    if (showDropdown) {
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [showDropdown]);

  return (
    <div className="container">
      <Head>
        <title>全景血缘图生成器 (Cytoscape版)</title>
      </Head>
      {/* 确保脚本加载策略为 beforeInteractive，且顺序正确 */}
      <Script src="/libs/cytoscape.min.js" strategy="beforeInteractive" />
      <Script src="/libs/graphlib.min.js" strategy="beforeInteractive" />
      <Script src="/libs/dagre.min.js" strategy="beforeInteractive" />
      <Script src="/libs/cytoscape-edgehandles.min.js" strategy="beforeInteractive" />
      <Script src="/libs/cytoscape-dagre.min.js" strategy="beforeInteractive" />
      <Script 
        src="/libs/xlsx.full.min.js" 
        strategy="beforeInteractive"
        onLoad={() => console.log('XLSX库已加载完成')}
        onError={(e) => console.error('XLSX库加载失败:', e)}
      />

      <main>
        <div className="hero-bg">
          <div className="hero-content">
            <h1>全景血缘图生成器</h1>
            <p className="subtitle">Cytoscape 交互版 · Excel 一键可视化</p>
          </div>
        </div>
        <div className="usage-guide usage-float">
          <h3>✨ 使用说明</h3>
          <ul>
            <li>点击节点：高亮祖先和子孙链路</li>
            <li><b>Ctrl</b>（或 <b>Cmd</b>）多选节点：对比多条路径</li>
            <li>再次点击已选节点可取消，点击空白处清空高亮</li>
            <li>点击节点名称自动复制到剪贴板</li>
          </ul>
        </div>

        <div className="controls">
          <label className="file-input-label" htmlFor="file-input">
            选择Excel文件
            {/* 关联 fileInputRef */}
            <input type="file" id="file-input" accept=".xlsx, .xls" style={{display:'none'}} ref={fileInputRef} />
          </label>
          <button className="action-btn" id="reset-zoom" disabled={isLoading}>重置视图</button>
          <button className="action-btn" id="download-image" disabled={isLoading}>下载为图片</button>
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="搜索节点名称..."
              value={searchValue}
              onChange={handleSearchChange}
              onFocus={e => { if (searchResults.length > 0) setShowDropdown(true); }}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
            />
            {showDropdown && searchResults.length > 0 && (
              <ul className="search-dropdown">
                {searchResults.map((opt, idx) => (
                  <li
                    key={opt.id}
                    className={idx === searchActiveIndex ? 'active' : ''}
                    onMouseDown={e => { e.preventDefault(); handleSelectNode(opt.id); }}
                  >
                    {opt.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 新增：显示当前选择的 Excel 文件名 */}
        <div className="file-display-area card-float">
          <span className="file-label">当前文件：</span>
          <span className="current-file-name">{uploadedFileName}</span>
        </div>

        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>正在处理文件，请稍候...</p>
          </div>
        )}

        <div className={"cy-area card-float" + (isLoading ? ' hidden' : '')}>
          <div id="cy"></div>
        </div>

        <div id="toast-message" className="toast"></div>
      </main>

      <footer className="footer card-float">
        <p>由 <span className="author-name">Tzz</span> 优化与维护</p>
      </footer>

      <style jsx>{`
        /* 全局样式和字体 */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background: linear-gradient(120deg, #6dd5ed 0%, #f8f9fa 100%);
          color: #343A40;
          font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hero-bg {
          width: 100vw;
          min-height: 220px;
          background: linear-gradient(100deg, #007BFF 0%, #4FC3F7 100%);
          box-shadow: 0 8px 32px rgba(0,123,255,0.10);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          position: relative;
        }
        .hero-content {
          text-align: center;
          margin-bottom: 32px;
        }
        .hero-content h1 {
          font-size: 3.2rem;
          color: #fff;
          font-weight: 900;
          letter-spacing: 2px;
          text-shadow: 0 6px 32px rgba(0,123,255,0.18), 0 1px 0 #fff;
        }
        .subtitle {
          color: #e3f0ff;
          font-size: 1.25rem;
          margin-top: 10px;
          letter-spacing: 1px;
          text-shadow: 0 2px 8px rgba(0,123,255,0.10);
        }

        .container {
          width: 100vw;
          max-width: 100vw;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-grow: 1;
          margin-top: -80px;
        }

        main {
          width: 100vw;
          max-width: 100vw;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: transparent;
          box-shadow: none;
          padding: 0 0 40px 0;
        }

        .usage-guide {
          background: #fff;
          border: 1.5px solid #e3eafc;
          border-radius: 16px;
          margin: 0 auto 32px auto;
          padding: 22px 32px 16px 32px;
          max-width: 700px;
          min-width: 320px;
          box-shadow: 0 8px 32px rgba(0,123,255,0.10);
          position: relative;
          top: -60px;
        }
        .usage-guide.usage-float {
          z-index: 10;
        }
        .usage-guide h3 {
          color: #007BFF;
          font-size: 1.18rem;
          margin-bottom: 10px;
          font-weight: 700;
        }
        .usage-guide ul {
          text-align: left;
          margin-left: 1.2em;
          color: #495057;
          font-size: 1.08rem;
        }
        .usage-guide li {
          margin-bottom: 8px;
        }

        .controls {
          display: flex;
          gap: 20px; /* 增加按钮间距 */
          margin-bottom: 25px; /* 增加间距 */
          justify-content: center;
          flex-wrap: wrap;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,123,255,0.07);
          padding: 24px 0 18px 0;
          margin-top: -30px;
          z-index: 5;
          max-width: 700px;
          min-width: 320px;
          margin-left: auto;
          margin-right: auto;
        }

        .file-input-label, .action-btn {
          background: linear-gradient(90deg, #007BFF 0%, #4FC3F7 100%);
          color: white !important;
          padding: 15px 28px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: all 0.25s cubic-bezier(.4,2,.6,1);
          border: none;
          box-shadow: 0 4px 16px rgba(0, 123, 255, 0.13);
          font-size: 1.08rem;
          letter-spacing: 0.5px;
          min-width: 160px;
          justify-content: center;
        }
        .file-input-label:hover, .action-btn:hover {
          background: linear-gradient(90deg, #0056B3 0%, #4FC3F7 100%);
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 8px 24px rgba(0, 123, 255, 0.18);
        }
        .action-btn {
          background: linear-gradient(90deg, #6C757D 0%, #90A4AE 100%);
          box-shadow: 0 4px 16px rgba(108, 117, 125, 0.13);
        }
        .action-btn:hover {
          background: linear-gradient(90deg, #5A6268 0%, #90A4AE 100%);
        }
        .action-btn:disabled {
          background: #E9ECEF;
          color: #ADB5BD !important;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .file-display-area {
          text-align: center;
          margin-bottom: 25px;
          font-size: 1.08rem;
          color: #495057;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 2px 12px rgba(0,123,255,0.07);
          padding: 14px 0 10px 0;
          max-width: 700px;
          min-width: 320px;
          margin-left: auto;
          margin-right: auto;
        }
        .file-label {
          color: #6C757D;
          font-weight: 500;
        }
        .current-file-name {
          font-weight: 700;
          color: #007BFF;
          word-break: break-all;
          margin-left: 8px;
        }

        .cy-area {
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 8px 32px rgba(0,123,255,0.10);
          padding: 18px 0 0 0;
          margin-bottom: 32px;
          margin-top: 0;
          min-height: 420px;
          position: relative;
          width: 100vw;
          min-width: 320px;
          margin-left: auto;
          margin-right: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .cy-area.hidden {
          opacity: 0;
          pointer-events: none;
        }
        #cy {
          width: 95vw;
          max-width: 95vw;
          min-width: 320px;
          height: 60vh;
          min-height: 350px;
          max-height: 70vh;
          border: 1.5px solid #DEE2E6;
          border-radius: 12px;
          background-color: #FFFFFF;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
          transition: opacity 0.5s ease;
          flex-grow: 1;
          margin: 0 auto;
        }

        .loading-overlay {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          background-color: rgba(255, 255, 255, 0.9);
          border-radius: 10px;
          border: 1px solid #DEE2E6;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
          color: #343A40;
          font-size: 1.3rem;
          flex-grow: 1;
        }

        .spinner {
          border: 5px solid rgba(0, 123, 255, 0.2);
          border-left-color: #007BFF;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        node, edge {
          transition-property: background-color, border-color, line-color, target-arrow-color, width, opacity;
          transition-duration: 0.3s;
        }

        .toast {
          visibility: hidden;
          min-width: 320px;
          margin-left: -160px;
          background: linear-gradient(90deg, #007BFF 0%, #4FC3F7 100%);
          color: #fff;
          text-align: center;
          border-radius: 12px;
          padding: 22px;
          position: fixed;
          z-index: 10000;
          left: 50%;
          bottom: 48px;
          font-size: 16px;
          opacity: 0;
          transition: opacity 0.5s, visibility 0.5s;
          box-shadow: 0 8px 24px rgba(0, 123, 255, 0.18);
        }
        .toast.show {
          visibility: visible;
          opacity: 1;
        }
        .toast.error {
          background: linear-gradient(90deg, #DC3545 0%, #ffb3b3 100%);
          box-shadow: 0 8px 24px rgba(220, 53, 69, 0.18);
        }

        .footer {
          margin-top: 40px;
          padding: 24px 0 18px 0;
          text-align: center;
          color: #6C757D;
          font-size: 1.02rem;
          border-top: none;
          width: 100vw;
          max-width: 900px;
          min-width: 320px;
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 2px 12px rgba(0,123,255,0.07);
          margin-left: auto;
          margin-right: auto;
        }
        .author-name {
          font-weight: bold;
          color: #007BFF;
        }

        /* 响应式设计 */
        @media (max-width: 900px) {
          .hero-content h1 {
            font-size: 2.1rem;
          }
          .usage-guide, .file-display-area, .cy-area, .footer {
            max-width: 98vw;
            min-width: 0;
            padding-left: 8px;
            padding-right: 8px;
            margin-left: auto;
            margin-right: auto;
          }
        }
        @media (max-width: 600px) {
          .hero-bg {
            min-height: 120px;
          }
          .hero-content {
            margin-bottom: 16px;
          }
          .hero-content h1 {
            font-size: 1.3rem;
          }
          .subtitle {
            font-size: 0.95rem;
          }
          .usage-guide {
            padding: 12px 4px 8px 4px;
            top: -30px;
          }
          .controls {
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 12px 0 8px 0;
          }
          .file-input-label, .action-btn {
            width: 98vw;
            min-width: 0;
            padding: 10px 0;
            font-size: 1rem;
          }
          .file-display-area, .cy-area, .footer {
            padding-left: 2px;
            padding-right: 2px;
            margin-left: auto;
            margin-right: auto;
          }
          #cy, .loading-overlay {
            height: 40vh;
            min-height: 180px;
          }
          .toast {
            min-width: 90vw;
            margin-left: 0;
            left: 5vw;
            right: 5vw;
            bottom: 12px;
            font-size: 14px;
            padding: 12px;
          }
        }
        /* 卡片悬浮效果 */
        .card-float {
          box-shadow: 0 8px 32px rgba(0,123,255,0.10);
          background: #fff;
          border-radius: 16px;
        }
        .search-box {
          position: relative;
          min-width: 220px;
          width: 260px;
          margin-right: 10px;
        }
        .search-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1.5px solid #90A4AE;
          font-size: 1.08rem;
          outline: none;
          transition: border 0.2s;
          box-shadow: 0 2px 8px rgba(0,123,255,0.04);
        }
        .search-input:focus {
          border: 1.5px solid #007BFF;
          background: #f4f8ff;
        }
        .search-dropdown {
          position: absolute;
          top: 110%;
          left: 0;
          width: 100%;
          background: #fff;
          border: 1.5px solid #e3eafc;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,123,255,0.10);
          z-index: 1001;
          max-height: 260px;
          overflow-y: auto;
          padding: 0;
          margin: 0;
          list-style: none;
        }
        .search-dropdown li {
          padding: 10px 16px;
          cursor: pointer;
          font-size: 1.05rem;
          color: #007BFF;
          transition: background 0.15s, color 0.15s;
        }
        .search-dropdown li.active, .search-dropdown li:hover {
          background: #e3f0ff;
          color: #0056B3;
        }
      `}</style>
    </div>
  )
}
