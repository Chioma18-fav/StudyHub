import './globals.css';
import Shell from '../components/Shell';
export const metadata = { title: 'StudyHub: study together', description: 'Share slides, ask the AI, and lock in timed study sessions with your people.' };
export default function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0e3b31" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Figtree:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}<Shell /></body>
    </html>
  );
}
