const https = require('https');
const http = require('http');

class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.proxyStats = new Map(); // 统计每个代理的使用情况
  }

  loadProxies(proxyList) {
    this.proxies = proxyList.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [host, port, username, password] = line.split(':');
        return { host, port: parseInt(port), username, password };
      });
    
    console.log(`Loaded ${this.proxies.length} proxies`);
    
    // 初始化统计
    this.proxies.forEach(proxy => {
      const key = `${proxy.host}:${proxy.port}`;
      this.proxyStats.set(key, { requests: 0, failures: 0, lastUsed: 0 });
    });
  }

  getNextProxy() {
    if (this.proxies.length === 0) {
      return null;
    }

    // 跳过失败的代理
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      const key = `${proxy.host}:${proxy.port}`;
      
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      
      if (!this.failedProxies.has(key)) {
        // 更新统计
        const stats = this.proxyStats.get(key);
        stats.requests++;
        stats.lastUsed = Date.now();
        
        return proxy;
      }
      
      attempts++;
    }
    
    // 如果所有代理都失败了，重置失败列表
    if (this.failedProxies.size === this.proxies.length) {
      console.log('All proxies failed, resetting...');
      this.failedProxies.clear();
      return this.proxies[0];
    }
    
    return null;
  }

  markProxyFailed(proxy) {
    const key = `${proxy.host}:${proxy.port}`;
    this.failedProxies.add(key);
    
    const stats = this.proxyStats.get(key);
    if (stats) {
      stats.failures++;
    }
    
    console.log(`Marked proxy ${key} as failed. Total failed: ${this.failedProxies.size}`);
  }

  getStats() {
    const totalProxies = this.proxies.length;
    const failedProxies = this.failedProxies.size;
    const activeProxies = totalProxies - failedProxies;
    
    return {
      total: totalProxies,
      active: activeProxies,
      failed: failedProxies,
      stats: Array.from(this.proxyStats.entries()).map(([key, stats]) => ({
        proxy: key,
        ...stats,
        failed: this.failedProxies.has(key)
      }))
    };
  }

  // 使用代理发送HTTP请求
  fetchWithProxy(url, options = {}) {
    return new Promise((resolve, reject) => {
      const proxy = this.getNextProxy();
      if (!proxy) {
        return reject(new Error('No available proxies'));
      }

      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      
      // 对于HTTPS，我们需要使用CONNECT方法建立隧道
      if (isHttps) {
        const connectOptions = {
          hostname: proxy.host,
          port: proxy.port,
          method: 'CONNECT',
          path: `${urlObj.hostname}:${urlObj.port || 443}`,
          headers: {}
        };

        // 添加代理认证
        if (proxy.username && proxy.password) {
          const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
          connectOptions.headers['Proxy-Authorization'] = `Basic ${auth}`;
        }

        const connectReq = http.request(connectOptions);
        
        connectReq.on('connect', (res, socket, head) => {
          if (res.statusCode === 200) {
            // 建立HTTPS连接
            const httpsOptions = {
              hostname: urlObj.hostname,
              port: urlObj.port || 443,
              path: urlObj.pathname + urlObj.search,
              method: options.method || 'GET',
              headers: {
                'Host': urlObj.hostname,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Connection': 'close',
                ...options.headers
              },
              socket: socket
            };

            const httpsReq = https.request(httpsOptions, (httpsRes) => {
              let data = '';
              
              httpsRes.on('data', (chunk) => {
                data += chunk;
              });
              
              httpsRes.on('end', () => {
                if (httpsRes.statusCode >= 200 && httpsRes.statusCode < 300) {
                  try {
                    const jsonData = JSON.parse(data);
                    resolve({
                      ok: true,
                      status: httpsRes.statusCode,
                      json: () => Promise.resolve(jsonData),
                      proxy: `${proxy.host}:${proxy.port}`
                    });
                  } catch (error) {
                    resolve({
                      ok: true,
                      status: httpsRes.statusCode,
                      text: () => Promise.resolve(data),
                      proxy: `${proxy.host}:${proxy.port}`
                    });
                  }
                } else {
                  reject(new Error(`HTTP ${httpsRes.statusCode}: ${data}`));
                }
              });
            });

            httpsReq.on('error', (error) => {
              this.markProxyFailed(proxy);
              reject(error);
            });

            httpsReq.setTimeout(10000, () => {
              httpsReq.destroy();
              this.markProxyFailed(proxy);
              reject(new Error('Request timeout'));
            });

            httpsReq.end();
          } else {
            this.markProxyFailed(proxy);
            reject(new Error(`Proxy connection failed: ${res.statusCode}`));
          }
        });

        connectReq.on('error', (error) => {
          this.markProxyFailed(proxy);
          reject(error);
        });

        connectReq.setTimeout(10000, () => {
          connectReq.destroy();
          this.markProxyFailed(proxy);
          reject(new Error('Proxy connection timeout'));
        });

        connectReq.end();
      } else {
        // HTTP请求的处理保持不变
        const requestOptions = {
          hostname: proxy.host,
          port: proxy.port,
          path: url,
          method: options.method || 'GET',
          headers: {
            'Host': urlObj.hostname,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Connection': 'close',
            ...options.headers
          }
        };

        // 添加代理认证
        if (proxy.username && proxy.password) {
          const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
          requestOptions.headers['Proxy-Authorization'] = `Basic ${auth}`;
        }

        const req = http.request(requestOptions, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const jsonData = JSON.parse(data);
                resolve({
                  ok: true,
                  status: res.statusCode,
                  json: () => Promise.resolve(jsonData),
                  proxy: `${proxy.host}:${proxy.port}`
                });
              } catch (error) {
                resolve({
                  ok: true,
                  status: res.statusCode,
                  text: () => Promise.resolve(data),
                  proxy: `${proxy.host}:${proxy.port}`
                });
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', (error) => {
          this.markProxyFailed(proxy);
          reject(error);
        });

        req.setTimeout(10000, () => {
          req.destroy();
          this.markProxyFailed(proxy);
          reject(new Error('Request timeout'));
        });

        req.end();
      }
    });
  }
}

module.exports = ProxyManager;