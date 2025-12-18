import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage on initial load
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bribebank_theme');
      if (saved === 'dark' || saved === 'light') {
        // Apply theme immediately on initial load
        const root = document.documentElement;
        if (saved === 'dark') {
          root.classList.add('dark');
          document.body.style.backgroundColor = '#111827';
        } else {
          root.classList.remove('dark');
          document.body.style.backgroundColor = '#f3f4f6';
        }
        return saved;
      }
    }
    // Default to dark
    if (typeof window !== 'undefined') {
      document.documentElement.classList.add('dark');
      document.body.style.backgroundColor = '#111827';
    }
    return 'dark';
  });

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem('bribebank_theme', theme);
    
    // Apply theme to document
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark');
      document.body.style.backgroundColor = '#111827'; // gray-900
    } else {
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f3f4f6'; // gray-100
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
