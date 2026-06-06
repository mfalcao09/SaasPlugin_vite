import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    if (title) {
      document.title = title;
    }
    return () => {
      // Cleanup not needed for title
    };
  }, [title]);
}