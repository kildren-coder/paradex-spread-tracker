'use client';

import { useState, useEffect, useRef } from 'react';

interface MonitoringStatus {
  isActive: boolean;
  startTime: number | null;
  remainingTime: number;
  isCollecting: boolean;
}

interface MonitoringControlProps {
  serverUrl: string;
  onStatusChange?: (status: MonitoringStatus) => void;
}

export default function MonitoringControl({ serverUrl, onStatusChange }: MonitoringControlProps) {
  const [status, setStatus] = useState<MonitoringStatus>({
    isActive: false,
    startTime: null,
    remainingTime: 0,
    isCollecting: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 使用ref来跟踪上一次的isActive状态，避免闭包问题
  const lastIsActiveRef = useRef<boolean>(false);

  // 格式化剩余时间
  const formatRemainingTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 获取监控状态
  const fetchStatus = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/monitoring/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStatus(data);
          
          // 使用ref来比较状态变化，避免闭包问题
          if (lastIsActiveRef.current !== data.isActive) {
            console.log(`📡 MonitoringControl: 状态变化 ${lastIsActiveRef.current} → ${data.isActive}`);
            lastIsActiveRef.current = data.isActive;
            onStatusChange?.(data);
          }
        }
      }
    } catch (error) {
      console.error('获取监控状态失败:', error);
    }
  };

  // 开始监控
  const startMonitoring = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🚀 发送开始监控请求...');
      const response = await fetch(`${serverUrl}/api/monitoring/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ 监控启动成功:', result.message);
        await fetchStatus(); // 立即更新状态
      } else {
        setError(result.message || '启动监控失败');
        console.error('❌ 监控启动失败:', result.message);
      }
    } catch (error) {
      const errorMsg = '无法连接到服务器';
      setError(errorMsg);
      console.error('❌ 启动监控时发生错误:', error);
    } finally {
      setLoading(false);
    }
  };

  // 停止监控
  const stopMonitoring = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('⏹️ 发送停止监控请求...');
      const response = await fetch(`${serverUrl}/api/monitoring/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ 监控停止成功:', result.message);
        await fetchStatus(); // 立即更新状态
      } else {
        setError(result.message || '停止监控失败');
        console.error('❌ 监控停止失败:', result.message);
      }
    } catch (error) {
      const errorMsg = '无法连接到服务器';
      setError(errorMsg);
      console.error('❌ 停止监控时发生错误:', error);
    } finally {
      setLoading(false);
    }
  };

  // 定期更新状态
  useEffect(() => {
    fetchStatus(); // 初始获取状态
    
    const interval = setInterval(() => {
      fetchStatus();
    }, 1000); // 每秒更新一次
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="monitoring-control">
      <div className="monitoring-header">
        <h3>🎛️ 监控控制</h3>
        <div className="monitoring-status">
          {status.isActive ? (
            <span className="status-active">🟢 监控中</span>
          ) : (
            <span className="status-inactive">🔴 已停止</span>
          )}
        </div>
      </div>

      {status.isActive && (
        <div className="countdown-display">
          <div className="countdown-time">
            ⏱️ 剩余时间: <span className="time-value">{formatRemainingTime(status.remainingTime)}</span>
          </div>
          <div className="countdown-bar">
            <div 
              className="countdown-progress" 
              style={{ 
                width: `${(status.remainingTime / (15 * 60 * 1000)) * 100}%` 
              }}
            ></div>
          </div>
        </div>
      )}

      <div className="control-buttons">
        {!status.isActive ? (
          <button 
            className="start-button"
            onClick={startMonitoring}
            disabled={loading}
          >
            {loading ? '启动中...' : '🚀 开始监控 (15分钟)'}
          </button>
        ) : (
          <div className="active-controls">
            <button 
              className="extend-button"
              onClick={startMonitoring}
              disabled={loading}
            >
              {loading ? '延长中...' : '🔄 延长15分钟'}
            </button>
            <button 
              className="stop-button"
              onClick={stopMonitoring}
              disabled={loading}
            >
              {loading ? '停止中...' : '⏹️ 停止监控'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="monitoring-info">
        <div className="info-item">
          <span className="info-label">数据收集:</span>
          <span className={`info-value ${status.isCollecting ? 'collecting' : 'idle'}`}>
            {status.isCollecting ? '🔄 收集中' : '⏸️ 空闲'}
          </span>
        </div>
        {status.startTime && (
          <div className="info-item">
            <span className="info-label">开始时间:</span>
            <span className="info-value">
              {new Date(status.startTime).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      <div className="monitoring-tips">
        <details>
          <summary>💡 使用说明</summary>
          <div className="tips-content">
            <p>• 点击"开始监控"启动15分钟的数据收集</p>
            <p>• 监控期间可以点击"延长15分钟"重置计时器</p>
            <p>• 15分钟后会自动停止，节省代理流量</p>
            <p>• 可以随时手动停止监控</p>
          </div>
        </details>
      </div>
    </div>
  );
}