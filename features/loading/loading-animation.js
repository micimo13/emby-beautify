(function() {
    // 获取当前页面的URL
    var currentURL = window.location.href;

    // 创建并插入 meta 标签（设置字符集和视口）
    var metaCharset = document.createElement('meta');
    metaCharset.setAttribute('charset', 'UTF-8');
    document.head.appendChild(metaCharset);

    var metaViewport = document.createElement('meta');
    metaViewport.setAttribute('name', 'viewport');
    metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    document.head.appendChild(metaViewport);

    // 创建并插入 title 标签
    var titleTag = document.createElement('title');
    titleTag.textContent = 'Emby Loading...';
    document.head.appendChild(titleTag);

    // 插入自定义样式
    var style = document.createElement('style');
    style.innerHTML = `
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #282c34;
            color: white;
            font-family: Arial, sans-serif;
        }

        .loader {
            border: 8px solid #f3f3f3;
            border-top: 8px solid #3498db;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .loading-container {
            text-align: center;
        }

        .server-name {
            font-size: 24px;
            margin-top: 20px;
        }
    `;
    document.head.appendChild(style);

    // 创建并插入加载动画
    var loaderDiv = document.createElement('div');
    loaderDiv.classList.add('loading-container');
    loaderDiv.innerHTML = `
        <div class="loader"></div>
        <div class="server-name" id="server-name">Emby服务器名称</div>
    `;
    document.body.appendChild(loaderDiv);

    // 延迟跳转，模拟页面加载效果
    setTimeout(function() {
        // 延时1秒后跳转到当前页面
        window.location.href = currentURL;
    }, 1000); // 延时1秒后跳转
})();
