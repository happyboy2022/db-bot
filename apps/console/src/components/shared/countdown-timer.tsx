'use client';

import { useState, useEffect, useMemo } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  /** 创建时间 */
  createdAt: Date;
  /** 过期时长（毫秒），默认 24 小时 */
  expiryDuration?: number;
  /** 是否显示图标 */
  showIcon?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 紧凑模式（只显示主要时间） */
  compact?: boolean;
}

// 默认 24 小时过期
const DEFAULT_EXPIRY_DURATION = 24 * 60 * 60 * 1000;

// 时间阈值（毫秒）
const THRESHOLD_URGENT = 6 * 60 * 60 * 1000; // 6小时 - 红色
const THRESHOLD_WARNING = 12 * 60 * 60 * 1000; // 12小时 - 黄色

/**
 * 计算剩余时间
 */
function calculateTimeRemaining(createdAt: Date, expiryDuration: number): number {
  const expiryTime = new Date(createdAt).getTime() + expiryDuration;
  const now = Date.now();
  return Math.max(0, expiryTime - now);
}

/**
 * 格式化剩余时间为可读字符串
 */
function formatTimeRemaining(ms: number, compact: boolean = false): string {
  if (ms <= 0) {
    return '已过期';
  }

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  if (compact) {
    if (hours > 0) {
      return `${hours}时${minutes}分`;
    }
    if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    }
    return `${seconds}秒`;
  }

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} 小时`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes} 分钟`);
  }
  if (hours === 0 && minutes < 10) {
    parts.push(`${seconds} 秒`);
  }

  return parts.join(' ');
}

/**
 * 获取紧急程度样式
 */
function getUrgencyStyles(ms: number): {
  textColor: string;
  bgColor: string;
  borderColor: string;
  icon: 'clock' | 'warning';
} {
  if (ms <= 0) {
    return {
      textColor: 'text-gray-500',
      bgColor: 'bg-gray-100',
      borderColor: 'border-gray-200',
      icon: 'warning',
    };
  }

  if (ms <= THRESHOLD_URGENT) {
    // 红色 - 紧急（< 6小时）
    return {
      textColor: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      icon: 'warning',
    };
  }

  if (ms <= THRESHOLD_WARNING) {
    // 黄色 - 警告（6-12小时）
    return {
      textColor: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      icon: 'clock',
    };
  }

  // 绿色 - 正常（> 12小时）
  return {
    textColor: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: 'clock',
  };
}

export function CountdownTimer({
  createdAt,
  expiryDuration = DEFAULT_EXPIRY_DURATION,
  showIcon = true,
  className,
  compact = false,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(() =>
    calculateTimeRemaining(createdAt, expiryDuration)
  );

  useEffect(() => {
    // 计算更新间隔：剩余时间少于10分钟时每秒更新，否则每分钟更新
    const getUpdateInterval = () => {
      if (timeRemaining <= 0) return null;
      if (timeRemaining <= 10 * 60 * 1000) return 1000; // 每秒
      return 60 * 1000; // 每分钟
    };

    const interval = getUpdateInterval();
    if (!interval) return;

    const timer = setInterval(() => {
      setTimeRemaining(calculateTimeRemaining(createdAt, expiryDuration));
    }, interval);

    return () => clearInterval(timer);
  }, [createdAt, expiryDuration, timeRemaining]);

  const styles = useMemo(() => getUrgencyStyles(timeRemaining), [timeRemaining]);
  const formattedTime = useMemo(
    () => formatTimeRemaining(timeRemaining, compact),
    [timeRemaining, compact]
  );

  const isExpired = timeRemaining <= 0;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
        styles.bgColor,
        styles.borderColor,
        styles.textColor,
        className
      )}
    >
      {showIcon && (
        <>
          {styles.icon === 'warning' ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
        </>
      )}
      <span>
        {isExpired ? '已过期' : `剩余 ${formattedTime}`}
      </span>
    </span>
  );
}

/**
 * 简化版倒计时，用于表格等紧凑场景
 */
export function CompactCountdown({
  createdAt,
  expiryDuration = DEFAULT_EXPIRY_DURATION,
  className,
}: Pick<CountdownTimerProps, 'createdAt' | 'expiryDuration' | 'className'>) {
  return (
    <CountdownTimer
      createdAt={createdAt}
      expiryDuration={expiryDuration}
      showIcon={false}
      compact
      className={className}
    />
  );
}
