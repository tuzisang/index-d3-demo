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
const CY_NODE_COLOR = '#4FC3F7' // 浅蓝色
const CY_EDGE_COLOR = '#90A4AE' // 柔和的灰色
const CY_HIGHLIGHT_NODE_BG = '#FFEB3B' // 亮黄色
const CY_HIGHLIGHT_NODE_BORDER = '#FFC107' // 橙黄色
const CY_HIGHLIGHT_EDGE_COLOR = '#FF5722' // 橙红色
const CY_EDGEHANDLE_COLOR = '#FF5722' // 橙红色

export default function Home() {
  const cyRef = useRef(null) // 使用 useRef 存储 Cytoscape 实例
  const fileInputRef = useRef(null); // 用于直接操作文件输入框
  const [isLoading, setIsLoading] = useState(false) // 加载状态
  const [uploadedFileName, setUploadedFileName] = useState('未选择文件') // 上传文件名状态

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
          selector: '.highlighted-node',
          style: {
            'background-color': CY_HIGHLIGHT_NODE_BG,
            'border-color': CY_HIGHLIGHT_NODE_BORDER,
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
            'line-color': CY_HIGHLIGHT_EDGE_COLOR,
            'target-arrow-color': CY_HIGHLIGHT_EDGE_COLOR,
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

            if (!cellValue || cellValue === '/') continue

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
            {/* 关联 fileInputRef */}
            <input type="file" id="file-input" accept=".xlsx, .xls" style={{display:'none'}} ref={fileInputRef} />
          </label>
          <button className="action-btn" id="reset-zoom" disabled={isLoading}>重置视图</button>
          <button className="action-btn" id="download-image" disabled={isLoading}>下载为图片</button>
        </div>

        {/* 新增：显示当前选择的 Excel 文件名 */}
        <div className="file-display-area">
          <p>当前文件: <span className="current-file-name">{uploadedFileName}</span></p>
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
        /* 全局样式和字体 */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          background-color: #F8F9FA; /* 浅灰色背景 */
          color: #343A40; /* 深灰色文字 */
          font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; /* 优先使用 Inter 字体 */
          padding: 20px;
          min-height: 100vh;
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
          flex-grow: 1;
        }

        main {
          width: 100%;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          background-color: #FFFFFF; /* 主内容区白色背景 */
          border-radius: 12px; /* 更大的圆角 */
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08); /* 更柔和的阴影 */
          padding: 30px; /* 增加内边距 */
        }

        .header {
          text-align: center;
          margin-bottom: 30px; /* 增加间距 */
          padding-bottom: 15px;
          border-bottom: 1px solid #E9ECEF; /* 增加分隔线 */
        }

        .header h1 {
          font-size: 2.5rem; /* 增大标题 */
          margin-bottom: 10px;
          color: #007BFF; /* 品牌蓝色 */
          font-weight: 700; /* 加粗 */
        }

        .header p {
          font-size: 1.1rem;
          color: #6C757D; /* 柔和的灰色 */
        }

        .controls {
          display: flex;
          gap: 20px; /* 增加按钮间距 */
          margin-bottom: 25px; /* 增加间距 */
          justify-content: center;
          flex-wrap: wrap;
        }

        .file-input-label, .action-btn {
          background: #007BFF; /* 品牌蓝色 */
          color: white !important;
          padding: 14px 25px; /* 增大点击区域 */
          border-radius: 10px; /* 更大的圆角 */
          cursor: pointer;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: all 0.3s ease;
          border: none;
          box-shadow: 0 4px 10px rgba(0, 123, 255, 0.2); /* 蓝色阴影 */
          font-size: 1.05rem; /* 字体微调 */
        }

        .file-input-label:hover {
          background: #0056B3; /* 深蓝色 */
          transform: translateY(-3px); /* 增加悬停效果 */
          box-shadow: 0 6px 15px rgba(0, 123, 255, 0.3);
        }

        .action-btn {
          background: #6C757D; /* 柔和的灰色 */
          box-shadow: 0 4px 10px rgba(108, 117, 125, 0.2); /* 灰色阴影 */
        }

        .action-btn:hover {
          background: #5A6268; /* 深灰色 */
          transform: translateY(-3px);
          box-shadow: 0 6px 15px rgba(108, 117, 125, 0.3);
        }

        .action-btn:disabled {
          background-color: #E9ECEF; /* 浅灰色禁用背景 */
          color: #ADB5BD !important; /* 浅灰色禁用文字 */
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        /* 文件名显示区域 */
        .file-display-area {
          text-align: center;
          margin-bottom: 25px; /* 增加间距 */
          font-size: 1rem;
          color: #495057; /* 深一点的灰色 */
        }

        .current-file-name {
          font-weight: 700; /* 加粗 */
          color: #007BFF; /* 品牌蓝色 */
          word-break: break-all; /* 防止长文件名溢出 */
        }


        #cy {
          width: 100%;
          /* 修复：使用 calc() 计算高度，减去 header, controls, footer 和 body padding 的大致高度 */
          /* 200px 是一个估算值，你可以根据实际布局调整 */
          height: calc(100vh - 300px); /* 调整高度以适应新的间距和元素 */
          border: 1px solid #DEE2E6; /* 浅边框 */
          border-radius: 10px; /* 圆角 */
          background-color: #FFFFFF;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08); /* 柔和阴影 */
          transition: opacity 0.5s ease;
          flex-grow: 1;
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
          height: calc(100vh - 300px); /* 调整高度 */
          background-color: rgba(255, 255, 255, 0.9); /* 更透明的白色背景 */
          border-radius: 10px;
          border: 1px solid #DEE2E6;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
          color: #343A40;
          font-size: 1.3rem; /* 增大字体 */
          flex-grow: 1;
        }

        .spinner {
          border: 5px solid rgba(0, 123, 255, 0.2); /* 蓝色透明边框 */
          border-left-color: #007BFF; /* 品牌蓝色 */
          border-radius: 50%;
          width: 50px; /* 增大 */
          height: 50px; /* 增大 */
          animation: spin 1s linear infinite;
          margin-bottom: 20px; /* 增加间距 */
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
          min-width: 280px; /* 增大 */
          margin-left: -140px; /* 居中 */
          background-color: #343A40; /* 深灰色背景 */
          color: #fff;
          text-align: center;
          border-radius: 8px; /* 圆角 */
          padding: 18px; /* 增大内边距 */
          position: fixed;
          z-index: 10000;
          left: 50%;
          bottom: 40px; /* 离底部更远 */
          font-size: 15px; /* 字体微调 */
          opacity: 0;
          transition: opacity 0.5s, visibility 0.5s;
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.25); /* 更明显的阴影 */
        }

        .toast.show {
          visibility: visible;
          opacity: 1;
        }

        .toast.error {
          background-color: #DC3545; /* 红色错误提示 */
          box-shadow: 0 6px 12px rgba(220, 53, 69, 0.25);
        }

        .footer {
          margin-top: 40px;
          padding: 20px;
          text-align: center;
          color: #6C757D; /* 柔和的灰色 */
          font-size: 0.95rem;
          border-top: 1px solid #E9ECEF; /* 分隔线 */
          width: 100%;
          max-width: 1200px;
        }

        .author-name {
          font-weight: bold;
          color: #007BFF; /* 品牌蓝色 */
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          main {
            padding: 20px; /* 减小内边距 */
          }
          .header h1 {
            font-size: 2rem;
          }
          .controls {
            flex-direction: column;
            align-items: center;
            gap: 15px;
          }
          .file-input-label, .action-btn {
            width: 90%; /* 增大按钮宽度 */
            text-align: center;
            justify-content: center;
            padding: 12px 20px;
          }
          /* 修复：小屏幕下也使用 calc()，但可以调整减去的值 */
          #cy, .loading-overlay {
            height: calc(100vh - 280px); /* 调整高度 */
          }
          .toast {
            min-width: 90%;
            margin-left: 0;
            left: 5%;
            right: 5%;
            bottom: 20px;
          }
        }
      `}</style>
    </div>
  )
}
