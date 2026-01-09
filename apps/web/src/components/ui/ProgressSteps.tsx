'use client';

import { CheckCircle } from 'lucide-react';

interface ProgressStepsProps {
  steps: string[];
  currentStep: number;
  animated?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  colorScheme?: 'primary' | 'success' | 'warning';
}

const sizeConfig = {
  sm: {
    circle: 'h-6 w-6 text-xs',
    line: 'h-0.5',
    icon: 'h-3 w-3',
    label: 'text-xs',
  },
  md: {
    circle: 'h-8 w-8 text-sm',
    line: 'h-1',
    icon: 'h-4 w-4',
    label: 'text-xs',
  },
  lg: {
    circle: 'h-10 w-10 text-base',
    line: 'h-1.5',
    icon: 'h-5 w-5',
    label: 'text-sm',
  },
};

const colorConfig = {
  primary: {
    completed: 'bg-agora-primary text-slate-900',
    current: 'bg-agora-primary/20 text-agora-primary border-2 border-agora-primary',
    pending: 'bg-agora-card text-agora-muted border border-agora-border',
    lineCompleted: 'bg-agora-primary',
    linePending: 'bg-agora-border',
  },
  success: {
    completed: 'bg-agora-success text-slate-900',
    current: 'bg-agora-success/20 text-agora-success border-2 border-agora-success',
    pending: 'bg-agora-card text-agora-muted border border-agora-border',
    lineCompleted: 'bg-agora-success',
    linePending: 'bg-agora-border',
  },
  warning: {
    completed: 'bg-agora-warning text-slate-900',
    current: 'bg-agora-warning/20 text-agora-warning border-2 border-agora-warning',
    pending: 'bg-agora-card text-agora-muted border border-agora-border',
    lineCompleted: 'bg-agora-warning',
    linePending: 'bg-agora-border',
  },
};

export function ProgressSteps({
  steps,
  currentStep,
  animated = true,
  size = 'md',
  showLabels = true,
  colorScheme = 'primary',
}: ProgressStepsProps) {
  const sizes = sizeConfig[size];
  const colors = colorConfig[colorScheme];

  const getStepStatus = (index: number) => {
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'current';
    return 'pending';
  };

  return (
    <div className="w-full">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const status = getStepStatus(index);
          const isLast = index === steps.length - 1;

          return (
            <div key={step} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
              {/* Step Circle */}
              <div
                className={`
                  flex items-center justify-center rounded-full font-medium
                  ${sizes.circle}
                  ${colors[status]}
                  ${animated && status === 'current' ? 'ring-2 ring-agora-primary/30' : ''}
                  transition-all duration-300
                `}
              >
                {status === 'completed' ? (
                  <CheckCircle className={sizes.icon} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div className={`flex-1 mx-2 ${sizes.line} rounded-full overflow-hidden bg-agora-border`}>
                  <div
                    className={`
                      h-full rounded-full
                      ${status === 'completed' ? colors.lineCompleted : colors.linePending}
                      ${animated ? 'transition-all duration-500' : ''}
                    `}
                    style={{
                      width: status === 'completed' ? '100%' : '0%',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex justify-between mt-2">
          {steps.map((step, index) => {
            const status = getStepStatus(index);
            return (
              <span
                key={step}
                className={`
                  ${sizes.label}
                  ${status === 'current' ? 'text-slate-900 font-medium' : 'text-agora-muted'}
                  ${index === 0 ? 'text-left' : index === steps.length - 1 ? 'text-right' : 'text-center'}
                  flex-1
                `}
              >
                {step}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact version with dots only
interface ProgressDotsProps {
  total: number;
  current: number;
  colorScheme?: 'primary' | 'success' | 'warning';
}

export function ProgressDots({
  total,
  current,
  colorScheme = 'primary',
}: ProgressDotsProps) {
  const colors = colorConfig[colorScheme];

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, index) => {
        const status = index < current ? 'completed' : index === current ? 'current' : 'pending';
        return (
          <div
            key={index}
            className={`
              h-2 w-2 rounded-full transition-all duration-300
              ${status === 'completed' ? colors.lineCompleted : status === 'current' ? colors.lineCompleted : 'bg-agora-border'}
              ${status === 'current' ? 'scale-125' : ''}
            `}
          />
        );
      })}
    </div>
  );
}
