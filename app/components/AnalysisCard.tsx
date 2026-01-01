'use client';

import { MarketAnalysis } from '../types';

interface AnalysisCardProps {
  analysis: MarketAnalysis;
}

export default function AnalysisCard({ analysis }: AnalysisCardProps) {
  const getStabilityClass = (score: number) => {
    if (score >= 70) return 'stability-excellent';
    if (score >= 50) return 'stability-good';
    if (score >= 30) return 'stability-fair';
    return 'stability-poor';
  };

  const getRiskLevel = (veryHighSpreadFreq: number, highSpreadFreq: number) => {
    if (veryHighSpreadFreq > 10) return { level: '极高风险', class: 'risk-extreme' };
    if (veryHighSpreadFreq > 5 || highSpreadFreq > 20) return { level: '高风险', class: 'risk-high' };
    if (highSpreadFreq > 10) return { level: '中风险', class: 'risk-medium' };
    return { level: '低风险', class: 'risk-low' };
  };

  const formatPercent = (percent: number | undefined) => {
    if (percent === undefined || percent === null || isNaN(percent)) {
      return '0.00%';
    }
    return `${percent.toFixed(2)}%`;
  };

  const formatSpread = (spread: number | undefined) => {
    if (spread === undefined || spread === null || isNaN(spread)) {
      return '0.0000%';
    }
    return `${spread.toFixed(4)}%`;
  };

  const formatTime = (timestamp: number | undefined) => {
    if (!timestamp) {
      return '--:--:--';
    }
    return new Date(timestamp).toLocaleTimeString('zh-CN', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="analysis-card">
      <div className="analysis-header">
        <div className="market-symbol">{analysis.symbol}</div>
        <div className={`stability-badge ${getStabilityClass(analysis.stabilityScore || 0)}`}>
          评分: {(analysis.stabilityScore || 0).toFixed(1)}
        </div>
      </div>
      
      <div className="risk-indicator">
        <div className={`risk-badge ${getRiskLevel(analysis.veryHighSpreadFreq || 0, analysis.highSpreadFreq || 0).class}`}>
          {getRiskLevel(analysis.veryHighSpreadFreq || 0, analysis.highSpreadFreq || 0).level}
        </div>
        <div className="volatility-info">
          波动性: {formatSpread(analysis.spreadStdDev)}
        </div>
      </div>
      
      <div className="analysis-stats">
        <div className="stat-row">
          <div className="stat-item highlight-positive">
            <div className="stat-label">稳定点差 (0.001%-0.01%)</div>
            <div className="stat-value medium-spread">{formatPercent(analysis.mediumSpreadFreq)}</div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">低点差 (&lt;0.001%)</div>
            <div className="stat-value low-spread">{formatPercent(analysis.lowSpreadFreq)}</div>
          </div>
        </div>
        
        <div className="stat-row">
          <div className="stat-item">
            <div className="stat-label">零点差频率</div>
            <div className="stat-value zero-spread">{formatPercent(analysis.zeroSpreadFreq)}</div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">负点差频率</div>
            <div className="stat-value negative-spread">{formatPercent(analysis.negativeSpreadFreq)}</div>
          </div>
        </div>
        
        <div className="stat-row">
          <div className="stat-item warning">
            <div className="stat-label">高点差 (&gt;0.01%)</div>
            <div className="stat-value high-spread">{formatPercent(analysis.highSpreadFreq)}</div>
          </div>
          
          <div className="stat-item danger">
            <div className="stat-label">极高点差 (&gt;0.05%)</div>
            <div className="stat-value very-high-spread">{formatPercent(analysis.veryHighSpreadFreq)}</div>
          </div>
        </div>
        
        <div className="stat-row">
          <div className="stat-item">
            <div className="stat-label">平均点差</div>
            <div className="stat-value avg-spread">{formatSpread(analysis.avgSpread)}</div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">数据点数 (3分钟内)</div>
            <div className="stat-value data-points">{analysis.totalPoints || 0}</div>
          </div>
        </div>
        
        <div className="stat-row">
          <div className="stat-item">
            <div className="stat-label">点差范围</div>
            <div className="stat-value spread-range">
              {formatSpread(analysis.minSpread)} ~ {formatSpread(analysis.maxSpread)}
            </div>
          </div>
          
          <div className="stat-item">
            <div className="stat-label">评分详情</div>
            <div className="stat-value score-detail">
              <details>
                <summary>展开</summary>
                <div className="score-breakdown">
                  <div className="stability-factor">稳定性因子: {analysis.scoreBreakdown?.stabilityFactor || '0'}</div>
                  <div>稳定奖励: +{analysis.scoreBreakdown?.stabilityBonus || '0'}</div>
                  <div>低点差奖励: +{analysis.scoreBreakdown?.lowSpreadBonus || '0'}</div>
                  <div>零点差奖励(动态): +{analysis.scoreBreakdown?.zeroSpreadBonus || '0'}</div>
                  <div>负点差奖励(动态): +{analysis.scoreBreakdown?.negativeSpreadBonus || '0'}</div>
                  <div>一致性奖励: +{analysis.scoreBreakdown?.consistencyBonus || '0'}</div>
                  <div>高点差惩罚: -{analysis.scoreBreakdown?.highSpreadPenalty || '0'}</div>
                  <div>极高点差惩罚: -{analysis.scoreBreakdown?.veryHighSpreadPenalty || '0'}</div>
                  <div>波动性惩罚: -{analysis.scoreBreakdown?.volatilityPenalty || '0'}</div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
      
      <div className="analysis-footer">
        <div className="last-update">
          最后更新: {formatTime(analysis.lastUpdate)}
        </div>
      </div>
    </div>
  );
}