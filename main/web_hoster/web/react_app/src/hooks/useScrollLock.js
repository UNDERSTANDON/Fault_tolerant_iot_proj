import { useEffect } from 'react';

let activeLockCount = 0;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';
let savedBodyScrollbarGutter = '';

function acquireScrollLock() {
  if (typeof document === 'undefined') return;
  if (activeLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    savedHtmlOverflow = document.documentElement.style.overflow;
    savedBodyScrollbarGutter = document.body.style.scrollbarGutter;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.scrollbarGutter = 'stable';
  }
  activeLockCount += 1;
}

function releaseScrollLock() {
  if (typeof document === 'undefined') return;
  if (activeLockCount <= 0) return;
  activeLockCount -= 1;
  if (activeLockCount === 0) {
    document.documentElement.style.overflow = savedHtmlOverflow;
    document.body.style.overflow = savedBodyOverflow;
    document.body.style.scrollbarGutter = savedBodyScrollbarGutter;
  }
}

export function useScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return undefined;
    acquireScrollLock();
    return () => {
      releaseScrollLock();
    };
  }, [isLocked]);
}
