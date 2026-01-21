'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface AccessibleDropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
}

/**
 * AccessibleDropdown - A fully accessible dropdown/select component
 *
 * Features:
 * - Full keyboard navigation (Arrow keys, Enter, Space, Escape, Home, End)
 * - Type-ahead search for quick selection
 * - ARIA attributes for screen readers
 * - Focus management
 */
export function AccessibleDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  className,
  buttonClassName,
  menuClassName,
  disabled = false,
}: AccessibleDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [typeahead, setTypeahead] = useState('');
  const typeaheadTimeout = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useRef(`dropdown-${Math.random().toString(36).substring(7)}`);

  const selectedOption = options.find(opt => opt.value === value);
  const enabledOptions = options.filter(opt => !opt.disabled);

  // Clear typeahead after delay
  useEffect(() => {
    if (typeahead) {
      if (typeaheadTimeout.current) clearTimeout(typeaheadTimeout.current);
      typeaheadTimeout.current = setTimeout(() => setTypeahead(''), 500);
    }
    return () => {
      if (typeaheadTimeout.current) clearTimeout(typeaheadTimeout.current);
    };
  }, [typeahead]);

  // Type-ahead search
  useEffect(() => {
    if (typeahead && isOpen) {
      const matchIndex = options.findIndex(
        opt =>
          !opt.disabled &&
          opt.label.toLowerCase().startsWith(typeahead.toLowerCase())
      );
      if (matchIndex !== -1) {
        setHighlightedIndex(matchIndex);
      }
    }
  }, [typeahead, isOpen, options]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen(true);
      // Set highlight to current selection or first enabled option
      const currentIndex = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : enabledOptions.length > 0 ? options.indexOf(enabledOptions[0]) : 0);
    }
  }, [disabled, options, value, enabledOptions]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    setTypeahead('');
    buttonRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (optionValue: string) => {
      const option = options.find(opt => opt.value === optionValue);
      if (option && !option.disabled) {
        onChange(optionValue);
        handleClose();
      }
    },
    [onChange, handleClose, options]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (disabled) return;

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            handleSelect(options[highlightedIndex].value);
          } else {
            handleOpen();
          }
          break;

        case 'Escape':
          event.preventDefault();
          handleClose();
          break;

        case 'ArrowDown':
          event.preventDefault();
          if (!isOpen) {
            handleOpen();
          } else {
            const nextIndex = enabledOptions.findIndex(
              (_, i) => options.indexOf(enabledOptions[i]) > highlightedIndex
            );
            if (nextIndex !== -1) {
              setHighlightedIndex(options.indexOf(enabledOptions[nextIndex]));
            }
          }
          break;

        case 'ArrowUp':
          event.preventDefault();
          if (isOpen) {
            const prevIndex = [...enabledOptions]
              .reverse()
              .findIndex(
                (_, i) =>
                  options.indexOf(enabledOptions[enabledOptions.length - 1 - i]) <
                  highlightedIndex
              );
            if (prevIndex !== -1) {
              setHighlightedIndex(
                options.indexOf(enabledOptions[enabledOptions.length - 1 - prevIndex])
              );
            }
          }
          break;

        case 'Home':
          event.preventDefault();
          if (isOpen && enabledOptions.length > 0) {
            setHighlightedIndex(options.indexOf(enabledOptions[0]));
          }
          break;

        case 'End':
          event.preventDefault();
          if (isOpen && enabledOptions.length > 0) {
            setHighlightedIndex(
              options.indexOf(enabledOptions[enabledOptions.length - 1])
            );
          }
          break;

        default:
          // Type-ahead
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            if (!isOpen) handleOpen();
            setTypeahead(prev => prev + event.key);
          }
          break;
      }
    },
    [disabled, isOpen, highlightedIndex, options, enabledOptions, handleOpen, handleClose, handleSelect]
  );

  // Close on outside click
  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          buttonRef.current &&
          !buttonRef.current.contains(event.target as Node) &&
          listRef.current &&
          !listRef.current.contains(event.target as Node)
        ) {
          handleClose();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClose]);

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label
          id={`${id.current}-label`}
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${id.current}-listbox`}
        aria-labelledby={label ? `${id.current}-label` : undefined}
        aria-disabled={disabled}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
          'border-gray-300 bg-white text-gray-900',
          'dark:border-gray-600 dark:bg-gray-700 dark:text-white',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          buttonClassName
        )}
        onClick={() => (isOpen ? handleClose() : handleOpen())}
        onKeyDown={handleKeyDown}
      >
        <span className={cn(!selectedOption && 'text-gray-400')}>
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul
          ref={listRef}
          id={`${id.current}-listbox`}
          role="listbox"
          aria-labelledby={label ? `${id.current}-label` : undefined}
          aria-activedescendant={
            highlightedIndex >= 0
              ? `${id.current}-option-${highlightedIndex}`
              : undefined
          }
          className={cn(
            'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border py-1',
            'border-gray-200 bg-white shadow-lg',
            'dark:border-gray-700 dark:bg-gray-800',
            menuClassName
          )}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id.current}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                option.disabled
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                index === highlightedIndex &&
                  'bg-indigo-50 dark:bg-indigo-900/20',
                option.value === value &&
                  'font-medium text-indigo-600 dark:text-indigo-400'
              )}
              onClick={() => !option.disabled && handleSelect(option.value)}
              onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
            >
              {option.icon}
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
