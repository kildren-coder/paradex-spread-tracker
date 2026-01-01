import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Paradex Spread Tracker',
  description: '实时监控Paradex市场点差',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📊</text></svg>',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // 防止钱包扩展冲突
              (function() {
                try {
                  // 捕获并忽略钱包扩展错误
                  const originalError = window.onerror;
                  window.onerror = function(msg, url, line, col, error) {
                    if (msg && (
                      msg.includes('chainId') || 
                      msg.includes('ethereum') || 
                      msg.includes('solana') ||
                      url && url.includes('chrome-extension')
                    )) {
                      return true; // 阻止错误显示
                    }
                    if (originalError) {
                      return originalError.apply(this, arguments);
                    }
                    return false;
                  };
                  
                  // 捕获未处理的Promise错误
                  window.addEventListener('unhandledrejection', function(event) {
                    if (event.reason && event.reason.message && (
                      event.reason.message.includes('chainId') ||
                      event.reason.message.includes('ethereum') ||
                      event.reason.message.includes('solana')
                    )) {
                      event.preventDefault();
                    }
                  });
                } catch (e) {
                  // 忽略初始化错误
                }
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}