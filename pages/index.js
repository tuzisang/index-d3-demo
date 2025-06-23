import Head from 'next/head'
import Script from 'next/script'
import { useEffect, useRef, useState, useCallback } from 'react'

// 定义常量，避免在每次渲染时重复创建
const COLUMN_CHAIN = [22, 39, 56, 73, 90, 107, 125]
const COLUMN_MAP = {
  22: 'W', 39: 'AN', 56: 'BE', 73: 'BV',
  90: 'CM', 107: 'DD', 125: 'DV'
}

// 定义 Cytoscape 内部使用的颜色常量，不再使用 CSS 变量
const CY_NODE_COLOR = '#4FC3F7'
const CY_EDGE_COLOR = '#B0BEC5'
const CY_HIGHLIGHT_NODE_BG = '#FFD700'
const CY_HIGHLIGHT_NODE_BORDER = '#FFA500'
const CY_HIGHLIGHT_EDGE_COLOR = '#FF4500'
const CY_EDGEHANDLE_COLOR = '#FF5722'

export default function Home() {
  const cyRef = useRef(null) // 使用 useRef 存储 Cytoscape 实例
  const [isLoading, setIsLoading] = useState(false) // 加载状态
  const [uploadedFileName, setUploadedFileName] = useState('全景血缘图') // 上传文件名状态

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
            'background-color': CY_NODE_COLOR, // 使用硬编码颜色
            'border-color': CY_NODE_COLOR,     // 使用硬编码颜色
            'border-width': 1,
            'font-size': '10px',
            'color': '#000',
            'text-outline-color': '#fff',
            'text-outline-width': '0px'
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
            'line-color': CY_EDGE_COLOR, // 使用硬编码颜色
            'target-arrow-color': CY_EDGE_COLOR, // 使用硬编码颜色
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'source-endpoint': 'outside-to-node',
            'target-endpoint': 'outside-to-node'
          }
        },
        {
          selector: '.highlighted-node',
          style: {
            'background-color': CY_HIGHLIGHT_NODE_BG, // 使用硬编码颜色，移除 !important
            'border-color': CY_HIGHLIGHT_NODE_BORDER, // 使用硬编码颜色，移除 !important
            'font-weight': 'bold',
            'color': '#333',
            'text-outline-width': '1px',
            'text-outline-color': '#fff',
            'z-index': 9999
          }
        },
        {
          selector: '.highlighted-edge',
          style: {
            'line-color': CY_HIGHLIGHT_EDGE_COLOR, // 使用硬编码颜色，移除 !important
            'target-arrow-color': CY_HIGHLIGHT_EDGE_COLOR, // 使用硬编码颜色，移除 !important
            'width': 2,
            'z-index': 9998
          }
        }
      ]
    })

    // 检查并注册 edgehandles 扩展
    if (typeof cyRef.current.edgehandles === 'function') {
      cyRef.current.edgehandles({
        handleSize: 10,
        handleColor: CY_EDGEHANDLE_COLOR, // 使用硬编码颜色
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
            color: CY_NODE_COLOR // 确保这里也使用硬编码颜色
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

            if (!cellValue || cellValue === '/') continue

            const nodeId = `${colName}_${cellValue}`
            if (!nodeMap.has(nodeId)) {
              nodes.push({
                group: 'nodes',
                data: {
                  id: nodeId,
                  label: cellValue,
                  color: CY_NODE_COLOR // 确保这里也使用硬编码颜色
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

    // 节点点击事件
    cyRef.current.on('tap', 'node', function(evt){
      const node = evt.target
      const nodeLabel = node.data('label')

      lastHighlightedElements.removeClass('highlighted-node highlighted-edge')

      if (node.hasClass('highlighted-node')) { // 如果点击的是已高亮的节点，则取消高亮
        lastHighlightedElements = cyRef.current.collection()
        return
      }

      const elementsToHighlight = getUpstreamPath(node)

      elementsToHighlight.nodes().addClass('highlighted-node')
      elementsToHighlight.edges().addClass('highlighted-edge')

      lastHighlightedElements = elementsToHighlight

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
        lastHighlightedElements.removeClass('highlighted-node highlighted-edge')
        lastHighlightedElements = cyRef.current.collection()
      }
    })
  }, [cyRef, showToast, getUpstreamPath])

  // 文件处理函数
  const handleFile = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsLoading(true) // 开始加载
    setUploadedFileName(file.name)

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
      } finally {
        setIsLoading(false) // 结束加载
      }
    }
    reader.onerror = (error) => {
      console.error('FileReader error:', error)
      showToast('文件读取失败，请重试。', true)
      setIsLoading(false)
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
      const fileInput = document.getElementById('file-input')
      const resetZoomBtn = document.getElementById('reset-zoom')
      const downloadImageBtn = document.getElementById('download-image')

      if (fileInput) fileInput.addEventListener('change', handleFile)
      if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom)
      if (downloadImageBtn) downloadImageBtn.addEventListener('click', downloadImage)

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
        const fileInput = document.getElementById('file-input')
        const resetZoomBtn = document.getElementById('reset-zoom')
        const downloadImageBtn = document.getElementById('download-image')

        if (fileInput) fileInput.removeEventListener('change', handleFile)
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
        <div className="header">
          <h1>全景血缘图生成器 (Cytoscape版)</h1>
          <p>上传Excel文件，自动生成全景血缘关系图</p>
        </div>

        <div className="controls">
          <label className="file-input-label" htmlFor="file-input">
            选择Excel文件
            <input type="file" id="file-input" accept=".xlsx, .xls" style={{display:'none'}} />
          </label>
          <button className="action-btn" id="reset-zoom" disabled={isLoading}>重置视图</button>
          <button className="action-btn" id="download-image" disabled={isLoading}>下载为图片</button>
        </div>

        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>正在处理文件，请稍候...</p>
          </div>
        )}

        <div id="cy" className={isLoading ? 'hidden' : ''}></div>

        <div id="toast-message" className="toast"></div>
      </main>

      <footer className="footer">
        <p>由 <span className="author-name">Tzz</span> 优化与维护</p>
      </footer>

      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background-color: #FFFFFF;
          color: #333;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
          min-height: 100vh; /* 确保body有最小高度，以便vh单位生效 */
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .container {
          width: 100%;
          max-width: 1200px;
          padding: 0 15px;
          display: flex;
          flex-direction: column;
          align-items: center;
          flex-grow: 1; /* 让container也占据可用空间 */
        }

        main {
          width: 100%;
          flex-grow: 1; /* 让main占据剩余空间 */
          display: flex;
          flex-direction: column; /* 内部元素垂直排列 */
        }

        .header {
          text-align: center;
          margin-bottom: 20px;
          padding: 15px;
          color: #333;
        }

        .header h1 {
          font-size: 2.2rem;
          margin-bottom: 10px;
          color: #007bff;
        }

        .controls {
          display: flex;
          gap: 15px;
          margin-bottom: 20px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .file-input-label, .action-btn {
          background: #007bff;
          color: white !important;
          padding: 12px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.3s ease;
          border: none;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          font-size: 1rem;
        }

        .file-input-label:hover {
          background: #0056b3;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
        }

        .action-btn {
          background: #6c757d;
        }

        .action-btn:hover {
          background: #5a6268;
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
        }

        .action-btn:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
          color: #666 !important;
        }

        #cy {
          width: 100%;
          /* 修复：使用 calc() 计算高度，减去 header, controls, footer 和 body padding 的大致高度 */
          /* 200px 是一个估算值，你可以根据实际布局调整 */
          height: calc(100vh - 200px); 
          border: 1px solid #ddd;
          border-radius: 8px;
          background-color: #FFFFFF;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transition: opacity 0.5s ease;
          flex-grow: 1; /* 让图表容器也占据剩余空间 */
        }

        #cy.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .loading-overlay {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          /* 修复：与 #cy 相同的高度计算方式 */
          height: calc(100vh - 200px); 
          background-color: rgba(255, 255, 255, 0.8);
          border-radius: 8px;
          border: 1px solid #ddd;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          color: #333;
          font-size: 1.2rem;
          flex-grow: 1; /* 让加载层也占据剩余空间 */
        }

        .spinner {
          border: 4px solid rgba(0, 0, 0, 0.1);
          border-left-color: #007bff;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 15px;
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
          min-width: 250px;
          margin-left: -125px;
          background-color: #333;
          color: #fff;
          text-align: center;
          border-radius: 5px;
          padding: 16px;
          position: fixed;
          z-index: 10000;
          left: 50%;
          bottom: 30px;
          font-size: 14px;
          opacity: 0;
          transition: opacity 0.5s, visibility 0.5s;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        .toast.show {
          visibility: visible;
          opacity: 1;
        }

        .toast.error {
          background-color: #dc3545;
        }

        .footer {
          margin-top: 40px;
          padding: 20px;
          text-align: center;
          color: #777;
          font-size: 0.9rem;
          border-top: 1px solid #eee;
          width: 100%;
          max-width: 1200px;
        }

        .author-name {
          font-weight: bold;
          color: #007bff;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          .header h1 {
            font-size: 1.8rem;
          }
          .controls {
            flex-direction: column;
            align-items: center;
          }
          .file-input-label, .action-btn {
            width: 80%;
            text-align: center;
            justify-content: center;
          }
          /* 修复：小屏幕下也使用 calc()，但可以调整减去的值 */
          #cy, .loading-overlay {
            height: calc(100vh - 180px); /* 小屏幕下可能顶部/底部空间更小，可以调整 */
          }
        }
      `}</style>
    </div>
  )
}
