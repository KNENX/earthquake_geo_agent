# 🌍 Earthquake Agent 项目学习计划

> **适用对象**：有JS基础、了解Vue框架概念，希望侧重前端开发的学习者  
> **总课时**：25课时（约一周，每天3-4课时）  
> **教学理念**：以项目代码为主线，从"能看懂"到"能修改"到"能扩展"

---

## 📅 第一天：项目架构与开发环境（第1-3课时）

### 第1课时：项目整体架构解析
**教学目标**：建立对项目的全局认知

**1.1 目录结构导读**
```
earthquake_agent/
├── api/           # 后端服务（Python FastAPI）
│   ├── main.py    # 核心服务文件（1226行）
│   ├── requirements.txt  # 依赖清单
│   └── boundaries/  # 地理数据
├── web/           # 前端应用
│   ├── index.html # 页面骨架
│   ├── src/
│   │   ├── main.js    # 前端核心逻辑（1600+行）
│   │   └── style.css  # 样式文件
│   └── package.json   # 前端依赖
└── scripts/       # 启动脚本
```

**1.2 前后端分离架构**
```
┌─────────────────┐    HTTP请求    ┌─────────────────┐
│                 │ ──────────────>│                 │
│   前端 (Web)    │                │   后端 (API)    │
│   Vite:5173     │ <──────────────│   Uvicorn:8000  │
│                 │    JSON数据    │                 │
└─────────────────┘                └─────────────────┘
        │                                  │
        │                                  │
        ▼                                  ▼
  用户交互界面                      USGS API + LLM API
```

**📝 实践任务**：
1. 用VSCode打开项目，对照目录结构找到每个文件
2. 启动项目，观察浏览器控制台的Network请求

---

### 第2课时：HTML骨架与CSS布局基础
**教学目标**：理解页面结构，为后续JS学习打底

**2.1 HTML结构分析** `index.html` 精读

```html
<!-- 核心布局层次 -->
<body>
  <!-- 第0层：地图背景 -->
  <div id="map"></div>
  
  <!-- 第1层：HUD界面覆盖 -->
  <!-- 搜索栏 -->
  <div id="search-container">...</div>
  
  <!-- 左侧数据面板 -->
  <div id="info-panel">...</div>
  
  <!-- 右下角工具栏 -->
  <div id="mission-control">...</div>
  
  <!-- 聊天侧边栏 -->
  <div id="chat-sidebar">...</div>
</body>
```

**2.2 关键CSS技术点**

| 技术点 | 文件位置 | 作用 |
|--------|----------|------|
| `glass-panel` | style.css | 毛玻璃效果（backdrop-filter） |
| Flex布局 | 多处 | 弹性盒子布局 |
| position: fixed/absolute | 多处 | 定位覆盖层 |
| CSS变量 | :root | 主题颜色统一管理 |

**📝 实践任务**：
1. 注释掉 `style.css` 中的 `.glass-panel`，观察视觉效果变化
2. 修改CSS变量中的主色调，看整体风格变化

---

### 第3课时：Vite开发环境与CDN引入
**教学目标**：理解现代前端开发工具链

**3.1 Vite是什么？**
- 极速开发服务器（热更新）
- 不需要配置复杂的webpack
- 支持 ES6 模块化

**3.2 CDN方式引入库**
```html
<!-- index.html 中的CDN引入 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
```

**对比**：CDN vs npm安装
- CDN：简单，适合学习，但不支持Tree-shaking
- npm：适合生产，需要打包

**📝 实践任务**：
1. 修改 `BACKEND_BASE` 地址（main.js第5行），尝试连接不同后端
2. 在 `package.json` 中查看前端依赖

---

## 📅 第二天：JavaScript核心语法复习（第4-6课时）

### 第4课时：ES6+核心语法
**教学目标**：掌握项目中使用的现代JS语法

**4.1 变量声明**
```javascript
// main.js 中的实际使用
const L = window.L;           // 常量，不可重新赋值
let earthquakeLayer = null;   // 变量，可重新赋值
```

**4.2 箭头函数**
```javascript
// 传统写法
function colorByMag(mag) {
  if (mag >= 7) return "#ef4444";
}

// 箭头函数（项目中的风格）
const colorByMag = (mag) => {
  if (mag >= 7) return "#ef4444";
};
```

**4.3 解构赋值**
```javascript
// 从对象中提取属性
const { mag, place, time } = feature.properties;

// 从数组中提取
const [lon, lat, depth] = coords;
```

**4.4 模板字符串**
```javascript
// 传统字符串拼接
const popup = '<div class="popup">' + place + '</div>';

// 模板字符串
const popup = `<div class="popup">${place}</div>`;
```

**📝 实践任务**：
1. 在浏览器控制台练习箭头函数
2. 将 `formatTime` 函数改写为传统function声明，对比差异

---

### 第5课时：数组与对象操作
**教学目标**：掌握数据处理的核心方法

**5.1 数组高阶函数**（项目高频使用）

```javascript
// map - 转换数组每个元素
const points = features.map(f => {
  const coords = f.geometry.coordinates;
  return [coords[1], coords[0]];  // [lat, lon]
});

// filter - 过滤满足条件的元素
const majorQuakes = features.filter(f => f.properties.mag >= 6.0);

// sort - 排序
const sorted = [...features].sort((a, b) => 
  b.properties.mag - a.properties.mag
);

// forEach - 遍历（无返回值）
features.forEach(f => console.log(f.properties.place));
```

**5.2 对象操作**
```javascript
// Object.keys / values / entries
const distribution = { 'Minor': 10, 'Major': 5 };
Object.keys(distribution);    // ['Minor', 'Major']
Object.values(distribution);  // [10, 5]

// 展开运算符
const newObj = { ...oldObj, newProp: 'value' };
```

**📝 实践任务**：
1. 在控制台输出 `currentFeatures`，使用 `filter` 筛选出震级>5的地震
2. 使用 `reduce` 计算所有地震的平均震级

---

### 第6课时：异步编程基础
**教学目标**：理解AJAX和异步请求

**6.1 回调 → Promise → async/await 演进**
```javascript
// 1. 回调地狱（不推荐）
fetch(url, function(response) {
  response.json(function(data) {
    console.log(data);
  });
});

// 2. Promise链
fetch(url)
  .then(response => response.json())
  .then(data => console.log(data));

// 3. async/await（项目使用方式）
async function runNLQuery() {
  const resp = await fetch(`${BACKEND_BASE}/api/nl-query`, {
    method: "POST",
    body: JSON.stringify({ query: q })
  });
  const payload = await resp.json();
  return payload;
}
```

**6.2 错误处理**
```javascript
async function runNLQuery() {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('请求失败');
    const data = await resp.json();
  } catch (e) {
    console.error('错误:', e);
    alert('查询出错: ' + e.message);
  } finally {
    setLoading(false);  // 无论成功失败都执行
  }
}
```

**📝 实践任务**：
1. 在控制台手动调用 `fetch('http://127.0.0.1:8000/health')`
2. 追踪 `runNLQuery` 函数的执行流程

---

## 📅 第三天：Leaflet地图可视化（第7-10课时）

### 第7课时：Leaflet基础
**教学目标**：理解地图库的核心概念

**7.1 地图初始化**
```javascript
// main.js 第33-47行
const map = L.map("map", {
  center: [35, 105],      // 中心点坐标 [纬度, 经度]
  zoom: 3,                // 缩放级别
  minZoom: 3,
  maxZoom: 18,
  layers: [gaode],        // 默认图层
});
```

**7.2 图层系统**
```javascript
// 底图（Tile Layer）
const gaode = L.tileLayer(
  "https://webrd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}",
  { maxZoom: 18 }
);

// 三种底图切换
const baseMaps = {
  "Standard Mode": gaode,
  "Command Mode": darkMatter,
  "Satellite View": satellite,
};
```

**📝 实践任务**：
1. 修改 `center` 坐标，观察地图初始位置变化
2. 在控制台执行 `map.setZoom(10)`，观察效果

---

### 第8课时：GeoJSON与矢量图层
**教学目标**：理解地理数据格式与渲染

**8.1 GeoJSON格式**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "us2024abcd",
      "geometry": {
        "type": "Point",
        "coordinates": [103.5, 30.2, 15]  // [经度, 纬度, 深度]
      },
      "properties": {
        "mag": 5.2,
        "place": "四川汶川",
        "time": 1704067200000
      }
    }
  ]
}
```

**8.2 渲染GeoJSON** `main.js` 第776-806行
```javascript
earthquakeLayer = L.geoJSON(geojson, {
  // 自定义每个点的样式
  pointToLayer: (feature, latlng) => {
    const mag = feature.properties.mag;
    return L.circleMarker(latlng, {
      radius: radiusByMag(mag),      // 圆的大小
      fillColor: colorByMag(mag),    // 圆的颜色
      fillOpacity: 0.8,
    });
  },
  
  // 绑定弹出框
  onEachFeature: (feature, layer) => {
    layer.bindPopup(`<b>${feature.properties.place}</b>`);
  }
}).addTo(map);
```

**📝 实践任务**：
1. 修改 `colorByMag` 函数，调整颜色阈值
2. 为每个地震点添加 `bindTooltip` 鼠标悬停提示

---

### 第9课时：交互事件处理
**教学目标**：理解地图交互机制

**9.1 点击事件**
```javascript
// 点击地震列表项飞到对应位置
li.addEventListener('click', () => {
  map.flyTo([coords[1], coords[0]], 8, { duration: 1.5 });
  // 打开弹出框
  earthquakeLayer.eachLayer(layer => {
    if (layer.feature.id === f.id) {
      layer.openPopup();
    }
  });
});
```

**9.2 地图事件**
```javascript
// 常用地图事件
map.on('click', (e) => {
  console.log('点击坐标:', e.latlng);
});

map.on('zoomend', () => {
  console.log('当前缩放级别:', map.getZoom());
});
```

**📝 实践任务**：
1. 添加地图点击事件，点击时在控制台显示坐标
2. 实现双击地图放大功能

---

### 第10课时：热力图插件
**教学目标**：理解第三方插件集成

**10.1 热力图原理**
```javascript
// main.js 第102-112行
function getHeatmapPoints(features) {
  return features.map(f => {
    const [lon, lat] = f.geometry.coordinates;
    const mag = f.properties.mag;
    // 计算强度值
    const intensity = Math.max(0.5, (mag + 1) / 8.0);
    return [lat, lon, intensity];  // [纬度, 经度, 强度]
  });
}
```

**10.2 热力图配置**
```javascript
L.heatLayer(points, {
  radius: 50,      // 影响半径
  blur: 30,        // 模糊程度
  max: 1.0,        // 最大强度
  gradient: {      // 颜色渐变
    0.2: '#0ea5e9',
    1.0: '#ef4444'
  }
}).addTo(map);
```

**📝 实践任务**：
1. 调整 `gradient` 颜色，创建自定义配色方案
2. 修改 `intensity` 计算公式，观察热力图变化

---

## 📅 第四天：Chart.js数据可视化（第11-13课时）

### 第11课时：Chart.js基础
**教学目标**：理解图表绑定的核心概念

**11.1 图表初始化**
```javascript
// main.js 第386-398行
magChart = new Chart(magCtx, {
  type: 'doughnut',      // 图表类型：环形图
  data: {
    labels: ['Minor', 'Light', 'Moderate', 'Strong', 'Major'],
    datasets: [{
      data: [10, 25, 30, 20, 15],  // 每个分类的数量
      backgroundColor: ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#ef4444'],
      borderWidth: 1,
      borderColor: '#fff'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%'        // 环形图中间空白比例
  }
});
```

**11.2 图表类型**
| 类型 | 用途 | 项目应用 |
|------|------|----------|
| doughnut | 占比分布 | 震级分布、深度分布 |
| bar | 数值对比 | 可扩展 |
| line | 趋势变化 | 可扩展 |

**📝 实践任务**：
1. 将 `type: 'doughnut'` 改为 `'pie'`，观察效果
2. 修改 `cutout` 值，观察环形图形态变化

---

### 第12课时：数据计算与图表更新
**教学目标**：理解数据处理流程

**12.1 数据分布计算**
```javascript
// main.js 第291-312行
function calculateMagDistribution(features) {
  const distribution = {
    'Minor (<4.0)': 0,
    'Light (4-5)': 0,
    'Moderate (5-6)': 0,
    'Strong (6-7)': 0,
    'Major (≥7)': 0
  };

  features.forEach(f => {
    const mag = f.properties.mag;
    if (mag < 4.0) distribution['Minor (<4.0)']++;
    else if (mag < 5.0) distribution['Light (4-5)']++;
    // ...
  });

  return distribution;
}
```

**12.2 图表更新**
```javascript
// 先销毁旧图表
if (magChart) {
  magChart.destroy();
  magChart = null;
}

// 创建新图表
magChart = new Chart(ctx, { ... });
```

**📝 实践任务**：
1. 添加新的震级分类"Great (≥8.0)"
2. 在控制台调用 `renderCharts(currentFeatures)` 验证

---

### 第13课时：自定义图表样式
**教学目标**：掌握图表美化技巧

**13.1 Tooltip自定义**
```javascript
options: {
  plugins: {
    tooltip: {
      callbacks: {
        label: function(context) {
          const value = context.parsed;
          const total = context.dataset.data.reduce((a, b) => a + b);
          const percentage = Math.round((value / total) * 100);
          return `${context.label}: ${value} (${percentage}%)`;
        }
      }
    }
  }
}
```

**13.2 响应式设计**
```javascript
options: {
  responsive: true,           // 自动适应容器
  maintainAspectRatio: false, // 不保持宽高比
  // 这对于Flex布局容器非常重要
}
```

**📝 实践任务**：
1. 修改tooltip显示格式，添加图标emoji
2. 尝试添加图例显示 `legend: { display: true }`

---

## 📅 第五天：前端交互与状态管理（第14-17课时）

### 第14课时：DOM操作与事件绑定
**教学目标**：理解原生JS的事件系统

**14.1 元素选择与操作**
```javascript
// 获取元素
const input = document.getElementById('nl');
const btn = document.getElementById('run-nl');

// 修改内容
document.getElementById('stat-count').textContent = stats.count;

// 添加/移除类
panel.classList.add('hidden');
panel.classList.remove('hidden');
panel.classList.toggle('active');
```

**14.2 事件监听**
```javascript
// 点击事件
btn.addEventListener('click', runNLQuery);

// 键盘事件
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runNLQuery();
});

// 全局键盘快捷键
document.addEventListener('keydown', (e) => {
  if (e.key === '/') {
    e.preventDefault();
    input.focus();
  }
  if (e.key === 'Escape') {
    // 关闭下拉菜单
  }
});
```

**📝 实践任务**：
1. 添加新的键盘快捷键（如 `R` 键重置地图）
2. 实现双击搜索框清空内容

---

### 第15课时：LocalStorage持久化
**教学目标**：理解浏览器本地存储

**15.1 存储API**
```javascript
// 存储
localStorage.setItem('earthquake_search_history', JSON.stringify(history));

// 读取
const saved = localStorage.getItem('earthquake_search_history');
const history = JSON.parse(saved);

// 删除
localStorage.removeItem('earthquake_search_history');

// 清空所有
localStorage.clear();
```

**15.2 项目中的应用**
```javascript
// main.js 第1066-1094行 - 搜索历史
function saveSearchHistory(query) {
  let history = JSON.parse(localStorage.getItem(STORAGE_KEY_SEARCH) || '[]');
  history = history.filter(item => item !== query);  // 去重
  history.unshift(query);  // 添加到开头
  history = history.slice(0, 5);  // 只保留5条
  localStorage.setItem(STORAGE_KEY_SEARCH, JSON.stringify(history));
}
```

**📝 实践任务**：
1. 在控制台查看 localStorage 内容
2. 修改历史记录保存数量从5条改为10条

---

### 第16课时：搜索历史下拉菜单
**教学目标**：理解动态UI组件开发

**16.1 动态创建DOM**
```javascript
// main.js 第1096-1184行
function showSearchHistory() {
  // 移除已存在的下拉框
  const existing = document.getElementById('search-history-dropdown');
  if (existing) existing.remove();

  // 创建新下拉框
  const dropdown = document.createElement('ul');
  dropdown.id = 'search-history-dropdown';

  // 填充历史项
  history.forEach(item => {
    const li = document.createElement('li');
    li.className = 'search-history-item';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = item;
    textSpan.addEventListener('click', () => {
      input.value = item;
      dropdown.remove();
      runNLQuery();
    });
    
    li.appendChild(textSpan);
    dropdown.appendChild(li);
  });

  searchContainer.appendChild(dropdown);
}
```

**16.2 点击外部关闭**
```javascript
document.addEventListener('click', (e) => {
  if (!searchContainer.contains(e.target)) {
    hideSearchHistory();
  }
});
```

**📝 实践任务**：
1. 为历史记录项添加删除按钮
2. 实现"清除全部历史"功能

---

### 第17课时：二次筛选滑块
**教学目标**：理解第三方UI组件集成

**17.1 noUiSlider集成**
```javascript
// main.js 第1592-1614行
window.noUiSlider.create(filterMagSlider, {
  start: [0, 10],       // 初始值
  connect: true,        // 连接两个滑块
  step: 0.1,            // 步进值
  range: { 'min': 0, 'max': 10 }
});

// 监听滑块变化
filterMagSlider.noUiSlider.on('update', (values) => {
  const [min, max] = values;
  // 更新显示
  magMinVal.textContent = min;
  magMaxVal.textContent = max;
  // 筛选数据
  applyFilter(min, max);
});
```

**17.2 筛选逻辑**
```javascript
function applyFilter(minMag, maxMag, minDepth, maxDepth) {
  const filtered = currentFeatures.filter(f => {
    const mag = f.properties.mag;
    const depth = f.geometry.coordinates[2];
    return mag >= minMag && mag <= maxMag 
        && depth >= minDepth && depth <= maxDepth;
  });
  
  // 重新渲染地图和图表
  renderGeoJSON({ features: filtered }, window.lastPlan, true);
  renderCharts(filtered);
}
```

**📝 实践任务**：
1. 添加筛选后的数据统计显示
2. 实现筛选后数据导出功能

---

## 📅 第六天：AI对话与流式响应（第18-20课时）

### 第18课时：AI对话界面开发
**教学目标**：理解聊天界面设计

**18.1 消息渲染**
```javascript
// main.js 第435-493行
function addChatBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  
  const textSpan = document.createElement('span');
  textSpan.className = 'markdown-body';
  
  // Markdown渲染
  if (window.marked) {
    const rawHtml = window.marked.parse(text);
    textSpan.innerHTML = window.DOMPurify.sanitize(rawHtml);
  }
  
  bubble.appendChild(textSpan);
  container.appendChild(bubble);
}
```

**18.2 XSS防护**
```javascript
// DOMPurify 防止恶意代码注入
// 用户输入: <script>alert('xss')</script>
// 经过sanitize后: &lt;script&gt;alert('xss')&lt;/script&gt;
```

**📝 实践任务**：
1. 不使用DOMPurify，尝试输入HTML代码看效果
2. 添加代码高亮（highlight.js）

---

### 第19课时：流式响应处理（SSE）
**教学目标**：理解Server-Sent Events

**19.1 什么是流式响应？**
```
传统响应：等待全部内容生成完毕，一次性返回
流式响应：内容逐字生成，实时返回

用户体验：
传统：等待5秒 → 突然显示全部内容
流式：立即开始 → 逐字显示，像打字效果
```

**19.2 前端Stream处理**
```javascript
// main.js 第576-626行
const resp = await fetch(url);
const reader = resp.body.getReader();
const decoder = new TextDecoder('utf-8');

let fullReply = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.substring(6));
      const content = data.choices[0]?.delta?.content || '';
      fullReply += content;
      
      // 实时更新UI
      textSpan.innerHTML = marked.parse(fullReply);
    }
  }
}
```

**📝 实践任务**：
1. 在控制台打印 `chunk`，观察SSE数据格式
2. 添加打字机音效（可选）

---

### 第20课时：上下文管理
**教学目标**：理解多轮对话机制

**20.1 上下文注入**
```javascript
// main.js 第228-288行
function buildContextAwareMessage(userMessage) {
  // 将地震数据摘要注入到用户消息前
  const contextContent = `
【当前地图上的地震数据背景】
用户查询：${lastQueryContext.userQuery}
数据统计：共 ${stats.count} 次地震
最大震级：${stats.max_magnitude}

【Top 20 最强地震列表】
${top20Str}

---
【用户当前问题】：${userMessage}
  `;
  
  return contextContent;
}
```

**20.2 历史截断**
```javascript
// 防止上下文过长
const MAX_CHAR_LIMIT = 30000;
let trimmedHistory = [];
let charCount = 0;

for (let i = chatHistory.length - 1; i >= 0; i--) {
  if (charCount + chatHistory[i].content.length > MAX_CHAR_LIMIT) break;
  trimmedHistory.unshift(chatHistory[i]);
  charCount += chatHistory[i].content.length;
}
```

**📝 实践任务**：
1. 修改 `MAX_CHAR_LIMIT`，观察对对话的影响
2. 添加token计数显示

---

## 📅 第七天：后端API理解与项目整合（第21-25课时）

### 第21课时：FastAPI后端入门
**教学目标**：理解后端API结构（非深度学习）

**21.1 API端点分析**
```python
# main.py 核心端点

# 健康检查
@app.get("/health")
def health():
    return {"status": "ok"}

# 自然语言查询
@app.post("/api/nl-query")
async def nl_query(payload: NLQueryIn):
    # 1. LLM解析用户输入
    plan = await llm_to_plan(payload.query)
    # 2. 调用USGS API获取数据
    geo = await fetch_usgs(usgs_params)
    # 3. 返回GeoJSON
    return {"geojson": geo, "stats": stats}

# AI对话
@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest):
    # 流式返回AI响应
    return StreamingResponse(stream_generator())
```

**21.2 Pydantic数据模型**
```python
class NLQueryIn(BaseModel):
    query: str = Field(min_length=1, max_length=500)

class ChatMessage(BaseModel):
    role: str
    content: str
```

**📝 实践任务**：
1. 访问 `http://127.0.0.1:8000/docs` 查看自动生成的API文档
2. 在Swagger UI中测试 `/health` 端点

---

### 第22课时：数据流完整链路
**教学目标**：理解前后端数据交互全过程

**22.1 查询流程图**
```
用户输入"过去7天日本地震"
        ↓
前端: fetch POST /api/nl-query
        ↓
后端: llm_to_plan() 调用Qwen模型
        ↓
后端: 返回 {window_unit: "days", window_value: 7, bbox: 日本范围}
        ↓
后端: fetch_usgs() 调用USGS API
        ↓
后端: filter_earthquakes_by_region() 多边形过滤
        ↓
后端: compute_stats() 计算统计数据
        ↓
前端: renderGeoJSON() 渲染地图
        ↓
前端: updateInfoPanel() 更新面板
```

**22.2 缓存策略**
```python
# 内存缓存，5分钟TTL
_USGS_CACHE = {}

def _cache_get(key):
    item = _USGS_CACHE.get(key)
    if item and time.time() < item[0]:  # 检查是否过期
        return item[1]
    return None
```

**📝 实践任务**：
1. 在后端添加打印语句，观察数据流
2. 修改缓存TTL时间，观察重复查询速度

---

### 第23课时：LLM Prompt工程
**教学目标**：理解如何设计Prompt让AI输出结构化数据

**23.1 系统Prompt结构**
```python
# main.py 第705-805行
def build_prompt(nl: str, today_cst: str) -> str:
    return f"""
你是一个专业的地震查询助手。
当前时间：{today_cst}

请将用户需求转换为JSON查询计划。

Schema:
{{
  "window_unit": "hours" | "days",
  "window_value": integer,
  "minmagnitude": number,
  "minlatitude": number,
  ...
}}

【处理规则】
1. 时间解析: "过去7天" → window_unit="days", window_value=7
2. 地理位置: "日本" → minlatitude=30.0, maxlatitude=46.0
3. 历史事件补全: "汶川地震" → start="2008-05-12"

用户问题：{nl}
"""
```

**23.2 Few-shot示例**
```python
# 在Prompt中添加示例，提高准确性
【完整示例】
User: 过去10年全球8级大地震
JSON: { "window_unit": "days", "window_value": 3650, "minmagnitude": 8.0 }

User: 2008年汶川地震
JSON: { "starttime": "2008-05-12", "endtime": "2008-05-13", ... }
```

**📝 实践任务**：
1. 修改Prompt，添加新的示例
2. 测试Prompt修改后的查询准确性

---

### 第24课时：数据导出功能
**教学目标**：理解文件下载机制

**24.1 CSV导出**
```javascript
// main.js 第130-154行
function convertToCSV(features) {
  const headers = ['Time', 'Magnitude', 'Place', 'Depth', 'Lat', 'Lon'];
  
  const rows = features.map(f => {
    const p = f.properties;
    const c = f.geometry.coordinates;
    return [
      new Date(p.time).toISOString(),
      p.mag,
      `"${p.place}"`,  // 处理逗号
      c[2],  // 深度
      c[1],  // 纬度
      c[0]   // 经度
    ].join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// 触发下载
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

**📝 实践任务**：
1. 添加Excel格式导出（需引入SheetJS库）
2. 添加导出时的进度提示

---

### 第25课时：项目整合与扩展思考
**教学目标**：总结所学，规划后续学习方向

**25.1 知识图谱总结**
```
前端开发
├── JavaScript核心
│   ├── ES6+语法（箭头函数、解构、模板字符串）
│   ├── 异步编程（Promise、async/await）
│   └── 数组方法（map、filter、reduce）
├── 地图可视化
│   ├── Leaflet基础（地图、图层、事件）
│   ├── GeoJSON格式
│   └── 热力图插件
├── 数据可视化
│   ├── Chart.js绑定
│   └── 自定义样式
├── 交互开发
│   ├── DOM操作
│   ├── 事件系统
│   └── LocalStorage
└── AI集成
    ├── 流式响应
    ├── Markdown渲染
    └── XSS防护
```

**25.2 可扩展方向**
1. **添加更多图表类型**：折线图显示时间趋势
2. **实现用户系统**：保存个人查询偏好
3. **添加离线功能**：Service Worker缓存
4. **移动端适配**：响应式设计优化
5. **性能优化**：虚拟列表、懒加载

**📝 毕业项目**：
选择以下任一功能实现：
- A. 添加地震预警推送（浏览器通知）
- B. 实现地震收藏功能（可保存感兴趣的地震）
- C. 添加地震对比功能（可对比两次地震数据）

---

## 📚 附录：推荐学习资源

### 官方文档
- [Leaflet官方文档](https://leafletjs.com/reference.html)
- [Chart.js官方文档](https://www.chartjs.org/docs/)
- [MDN JavaScript教程](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)

### 进阶书籍
- 《JavaScript高级程序设计》
- 《你不知道的JavaScript》
- 《数据可视化实战》

---

## 📝 学习建议

1. **边学边改**：每节课后动手修改代码，观察效果
2. **控制台为王**：学会使用浏览器DevTools调试
3. **阅读源码**：遇到不懂的函数，跳转定义看实现
4. **记录笔记**：建立自己的知识卡片系统
5. **提问交流**：遇到问题及时记录，寻求帮助

---

*祝学习顺利！*
