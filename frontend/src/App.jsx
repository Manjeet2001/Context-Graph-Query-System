import React, { useState, useEffect, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Maximize2, Minimize2, Layers, MoreHorizontal, Layout } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const fetchApi = async (path, options = {}) => {
  const prodUrl = 'https://context-graph-query-system.up.railway.app';
  const localUrl = 'http://localhost:8000';
  
  try {
    const res = await fetch(`${prodUrl}${path}`, options);
    // Let CORS or network errors fail over to local
    return res;
  } catch (err) {
    console.warn(`Production API unreachable, falling back to localhost: ${err.message}`);
    return fetch(`${localUrl}${path}`, options);
  }
};

export default function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hi! I can help you analyze the Order to Cash process. Ask me anything about Orders, Deliveries, and Billing.'}
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreenGraph, setIsFullscreenGraph] = useState(false);
  
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isClicked, setIsClicked] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 });
  const fgRef = useRef();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchGraphData();
  }, []);

  const fetchGraphData = async (nodeId = null) => {
    try {
      const path = nodeId ? `/api/graph?node_id=${nodeId}` : '/api/graph';
      const res = await fetchApi(path);
      const data = await res.json();
      setGraphData(data);
    } catch (error) {
      console.error("Error fetching graph:", error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMessages = [...messages, { role: 'user', content: inputMessage }];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetchApi('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage, history: newMessages })
      });
      const data = await res.json();
      
      setMessages([...newMessages, { role: 'assistant', content: data.response.answer }]);
      
      const match = data.response.answer.match(/\b(740\d{3}|905\d{5}|320\d{5}|310\d{5}|940\d{7}|911\d{5})\b/);
      if (match) {
        fetchGraphData(match[0]);
      }
      
    } catch (error) {
      setMessages([...newMessages, { role: 'assistant', content: 'Connection error while reaching the API.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNodeHover = (node) => {
    setHoverNode(node);
    if (!node) {
      if (!isClicked) {
         setSelectedNode(null);
         setNodeDetails(null);
      }
      return;
    }
    if (!isClicked) {
      setSelectedNode(node);
      const { x, y } = fgRef.current.graph2ScreenCoords(node.x, node.y);
      setCardPos({ x, y });
      
      const typeLabel = node.group === 1 ? 'Sales Order' : node.group === 2 ? 'Business Partner' : node.group === 3 ? 'Sales Item' : node.group === 4 ? 'Product' : node.group === 5 ? 'Delivery' : 'Billing / Journal Entry';
      setNodeDetails({
        id: node.id,
        type: typeLabel,
        companyCode: '1010',
        fiscalYear: '2025',
        transactionCurrency: 'INR',
        connections: graphData.links.filter(l => l.source.id === node.id || l.target.id === node.id).length
      });
    }
  };

  const handleNodeClick = async (node) => {
    setIsClicked(true);
    setSelectedNode(node);
    const { x, y } = fgRef.current.graph2ScreenCoords(node.x, node.y);
    setCardPos({ x, y });
    fgRef.current.centerAt(node.x, node.y, 1000);
    fgRef.current.zoom(3, 1000);
  };
  const handleBackgroundClick = () => {
    setIsClicked(false);
    setSelectedNode(null);
    setNodeDetails(null);
  };
  const { highlightedNodes, highlightedLinks } = useMemo(() => {
    const hn = new Set();
    const hl = new Set();
    if (selectedNode) {
      hn.add(selectedNode.id);
      graphData.links.forEach((link) => {
        if (link.source.id === selectedNode.id || link.target.id === selectedNode.id) {
          hl.add(link);
          hn.add(link.source.id);
          hn.add(link.target.id);
        }
      });
    }
    return { highlightedNodes: hn, highlightedLinks: hl };
  }, [selectedNode, graphData]);

  const drawNode = (node, ctx, globalScale) => {
    const isHovered = node === hoverNode;
    const isSelected = selectedNode && node.id === selectedNode.id;
    const isMainEntity = node.group === 1 || node.group === 2 || node.group === 6; 
    const isDimmed = selectedNode && !highlightedNodes.has(node.id);

    ctx.beginPath();
    const radius = isMainEntity ? 2.5 : 1.5;
    ctx.arc(node.x, node.y, isHovered || isSelected ? radius + 1 : radius, 0, 2 * Math.PI, false);
    
    if (isDimmed) {
      ctx.fillStyle = isMainEntity ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    } else {
      ctx.fillStyle = isMainEntity ? '#3b82f6' : '#ef4444';
    }
    ctx.fill();
    if (isSelected) {
      ctx.lineWidth = 1/globalScale;
      ctx.strokeStyle = '#1e3a8a';
      ctx.stroke();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white font-sans text-gray-800 overflow-hidden">
      
      
      <div className="h-[52px] border-b border-gray-100 flex items-center justify-between px-4 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <Layout size={18} className="text-gray-600" />
          <div className="h-4 w-[1px] bg-gray-300 mx-1"></div>
          <span className="text-sm text-gray-400">Mapping <span className="mx-1">/</span></span>
          <span className="text-sm font-bold text-gray-800 tracking-tight">Order to Cash</span>
        </div>
        <button className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
          <MoreHorizontal size={18} />
        </button>
      </div>

      
      <div className="flex flex-1 overflow-hidden relative">
        
        
        <div className={`relative transition-all duration-500 ease-in-out ${isFullscreenGraph ? 'w-full' : 'w-2/3'} border-r border-gray-100 bg-[#fafafa]`}>
          
          
          <div className="absolute top-6 left-6 z-10 flex items-center gap-3">
            <button 
              onClick={() => setIsFullscreenGraph(!isFullscreenGraph)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-md shadow-sm hover:bg-gray-50 transition-colors"
            >
              {isFullscreenGraph ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              {isFullscreenGraph ? 'Minimize' : 'Maximize'}
            </button>
            <button 
              onClick={() => setShowOverlay(!showOverlay)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0f1c] text-white text-xs font-semibold rounded-md shadow-sm hover:bg-gray-800 transition-colors"
            >
              <Layers size={12} />
              {showOverlay ? 'Hide Granular Overlay' : 'Show Granular Overlay'}
            </button>
          </div>
          
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel="" 
            linkColor={(link) => {
              if (selectedNode) {
                return highlightedLinks.has(link) ? '#1e3a8a' : 'rgba(200, 200, 200, 0.15)';
              }
              return '#bae6fd';
            }}
            linkWidth={(link) => selectedNode && highlightedLinks.has(link) ? 1.5 : 0.5}
            linkDirectionalParticles={selectedNode ? (link => highlightedLinks.has(link) ? 2 : 0) : 0}
            linkDirectionalParticleWidth={1.5}
            width={isFullscreenGraph ? window.innerWidth : window.innerWidth * 2/3}
            height={window.innerHeight - 52}
            nodeCanvasObject={drawNode}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            backgroundColor="#fafafa"
            onEngineStop={() => { if (fgRef.current) fgRef.current.zoomToFit(400, 50); }}
          />

          
          {showOverlay && selectedNode && nodeDetails && (
            <div 
              className="absolute z-20 bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-xl py-4 px-5 w-64 pointer-events-none"
              style={{ top: 0, left: 0, transform: `translate(${cardPos.x + 15}px, ${cardPos.y - 40}px)` }}
            >
              <h3 className="text-sm font-bold text-gray-900 mb-1">{nodeDetails.type}</h3>
              <div className="space-y-1 mt-3">
                <p className="text-[10px] text-gray-500 font-medium">Entity: <span className="font-normal text-gray-700">{nodeDetails.type}</span></p>
                <p className="text-[10px] text-gray-500 font-medium">ID: <span className="font-normal text-gray-700">{nodeDetails.id}</span></p>
                <p className="text-[10px] text-gray-500 font-medium">CompanyCode: <span className="font-normal text-gray-700">{nodeDetails.companyCode}</span></p>
                <p className="text-[10px] text-gray-500 font-medium">FiscalYear: <span className="font-normal text-gray-700">{nodeDetails.fiscalYear}</span></p>
                <p className="text-[10px] text-gray-500 font-medium">TransactionCurrency: <span className="font-normal text-gray-700">{nodeDetails.transactionCurrency}</span></p>
                <p className="text-[10px] text-gray-500 font-medium">Connections: <span className="font-normal text-gray-700">{nodeDetails.connections}</span></p>
                <p className="text-[9px] text-gray-400 italic pt-2 mt-2 border-t border-gray-50">Additional fields hidden for readability</p>
              </div>
            </div>
          )}
        </div>

        
        <div className={`flex flex-col transition-all duration-300 ${isFullscreenGraph ? 'w-0 opacity-0 hidden' : 'w-1/3'} bg-gradient-to-br from-slate-900 via-indigo-950 to-[#2c1a4d] border-l border-gray-800 shadow-2xl z-10`}>
          
          <div className="pt-8 px-8 pb-6 bg-gradient-to-b from-black/20 to-transparent">
            <h2 className="text-xl font-bold text-white leading-tight drop-shadow-sm">Chat with Graph</h2>
            <p className="text-xs text-indigo-300 mt-1 tracking-wider uppercase font-semibold">Order to Cash</p>
          </div>
          
          <div className="flex-[1_1_0%] overflow-y-auto px-8 py-2 space-y-6 pb-20 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-indigo-200 mb-1 flex items-center gap-1.5 font-medium">
                      You
                      <div className="w-5 h-5 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-200 shadow-sm border border-indigo-500/20">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                      </div>
                    </span>
                    <div className="bg-indigo-600 text-white text-base px-5 py-4 rounded-2xl rounded-tr-sm shadow-lg max-w-[90%] font-medium leading-relaxed border border-indigo-500/50">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-indigo-950 font-bold text-xs shadow-md shadow-purple-500/20 flex-shrink-0">
                        D
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white leading-none drop-shadow-sm">Dodge AI</h3>
                        <p className="text-[10px] text-indigo-300 mt-0.5 tracking-wider uppercase font-medium">Graph Agent</p>
                      </div>
                    </div>
                    <div className="text-base text-gray-100 leading-relaxed max-w-[95%] bg-white/10 backdrop-blur-md p-4 rounded-xl rounded-tl-sm shadow-xl border border-white/10">
                      <ReactMarkdown className="prose prose-base prose-invert max-w-none prose-p:my-1">
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex flex-col animate-pulse pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-white/20"></div>
                  <div className="h-3 bg-white/20 rounded w-20"></div>
                </div>
                <div className="h-2 bg-white/10 rounded w-3/4 mb-1.5 ml-9"></div>
                <div className="h-2 bg-white/10 rounded w-1/2 ml-9"></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          
          <div className="p-6 shrink-0 z-20 relative bg-gradient-to-t from-slate-900/80 to-transparent">
            
            
            <div className="absolute inset-x-6 bottom-6 top-6 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 blur-xl rounded-full z-0 pointer-events-none"></div>

            <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-3 shadow-2xl focus-within:ring-2 focus-within:ring-purple-400/50 focus-within:bg-white/15 transition-all">
              
              <div className="flex items-center gap-2 px-3 pt-1 pb-3">
                <span className="relative flex h-2 w-2">
                  <span className={isLoading ? "animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" : "absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isLoading ? 'bg-orange-500' : 'bg-green-500'}`}></span>
                </span>
                <span className="text-xs text-indigo-200 font-semibold tracking-wide">
                  {isLoading ? "Dodge AI is analyzing data..." : "Dodge AI is awaiting instructions"}
                </span>
              </div>

              <form onSubmit={sendMessage} className="flex items-center gap-2 relative pb-1">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Analyze anything"
                  className="w-full pl-3 pr-20 py-2.5 bg-transparent text-base text-white focus:outline-none placeholder-indigo-200/50 font-medium"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputMessage.trim()}
                  className={`absolute right-1.5 w-16 py-2 rounded-xl text-sm font-bold transition-all ${
                    inputMessage.trim() && !isLoading 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-purple-500/25 transform hover:-translate-y-0.5 border border-white/10' 
                      : 'bg-white/10 text-white/40 cursor-not-allowed border border-transparent'
                  }`}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
