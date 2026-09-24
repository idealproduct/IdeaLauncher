import React from 'react';
import {
  FolderOutlined,
  HomeFilled,
  LogoutOutlined,
  PlusOutlined,
  SettingOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Avatar, Button, ConfigProvider, Divider, Layout, Menu, Select, Tag, message } from 'antd';
import october from './assets/october.png';
import { Route, Routes, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import Instances from './pages/Instances';
import Settings from './pages/Settings';
import { useEffect, useState } from "react";


const { Sider, Content } = Layout;

const onSearch = (value: string) => {
  console.log('search:', value);
};

const items: MenuProps['items'] = [
  {
    key: '/',
    icon: <HomeFilled />,
    label: 'Home'
  },
  {
    key: '/instances',
    icon: <FolderOutlined />,
    label: 'Instances'
  },
];

const settingItems: MenuProps['items'] = [
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: 'Settings'
  },
];

interface AccountSummary {
  xboxXuid: string;
  username: string;
  avatar?: string;
  expiresAt: number;
  isExpired: boolean;
}

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>();
  const [isAccountLoading, setIsAccountLoading] = useState(true);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const navigate = useNavigate();

  const accountOptions = accounts.map((account) => ({
    value: String(account.xboxXuid),
    label: account.username,
    account,
  }));

  const handleAccountChange = async (xuid: string): Promise<void> => {
    setSelectedAccount(xuid);
    await window.api.setSelectedAccount(xuid);
  };

  const refreshAccounts = async (): Promise<void> => {
    const list = await window.api.getAccounts();
    const savedAccount = await window.api.getSelectedAccount();
    setAccounts(list);
    if (savedAccount && list.some((account) => account.xboxXuid === savedAccount)) {
      setSelectedAccount(savedAccount);
    } else if (list[0]) {
      setSelectedAccount(list[0].xboxXuid);
      await window.api.setSelectedAccount(list[0].xboxXuid);
    } else {
      setSelectedAccount(undefined);
    }
  };

  const login = async (): Promise<void> => {
    try {
      await window.api.loginMicrosoft();
      await refreshAccounts();
      setIsAccountMenuOpen(false);
      message.success('帳號登入成功');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登入失敗');
    }
  };

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        await refreshAccounts();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '無法載入帳號');
      } finally {
        setIsAccountLoading(false);
      }
    };
    void load();
  }, []);

  const selectedAccountInfo = accounts.find((account) => account.xboxXuid === selectedAccount);

  const logout = async (): Promise<void> => {
    if (!selectedAccount) return;
    try {
      const nextAccounts = await window.api.logout(selectedAccount);
      setAccounts(nextAccounts);
      const nextSelectedAccount = await window.api.getSelectedAccount();
      setSelectedAccount(nextSelectedAccount);
      setIsAccountMenuOpen(false);
      message.success('帳號已登出');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登出失敗');
    }
  };


  return (
    <Layout className="h-full w-full">

      <Sider
        collapsible
        collapsed={true}
        collapsedWidth="70"
        trigger={null}
        style={{ backgroundColor: '#0d8aa3' }}
      >

        <div className="demo-logo-vertical" />

        <div className="flex h-full flex-col text-10xl">

          <ConfigProvider
            theme={{
              components: {
                Menu: {
                  itemHeight: 56,
                  collapsedIconSize: 24,
                  iconSize: 28,
                  darkItemBg: '#0d8aa3',
                },
              },
            }}
          >

            <Menu
              theme="dark"
              mode="inline"
              defaultSelectedKeys={['/']}
              items={items}
              onClick={({ key }) => navigate(key)}
            />

            <div className="mt-auto">
              <Menu
                theme="dark"
                mode="inline"
                selectable={false}
                items={settingItems}
                onClick={({ key }) => navigate(key)}
              />

            </div>
          </ConfigProvider>

        </div>
      </Sider>

      <Content
        className="relative bg-cover bg-center w-full h-full"
        style={{
          backgroundImage: `url(${october})`,
        }}
      >

        <div className="absolute right-3 top-3 z-50 max-w-[calc(100vw-1.5rem)] sm:right-5 sm:top-4">
          <ConfigProvider
            theme={{
              token: {
                colorBgElevated: '#071b38',
                colorText: '#e6f0ff',
                colorTextSecondary: '#9bb2d1',
                colorBorder: '#244b7a',
              },
              components: {
                Select: {
                  selectorBg: '#0b2346',
                  optionActiveBg: '#12345f',
                  optionSelectedBg: '#1b477a',
                  optionSelectedColor: '#ffffff',
                  colorTextPlaceholder: '#9bb2d1',
                },
              },
            }}
          >
            <Select
              key={accounts.map((account) => account.xboxXuid).join('|')}
              className="account-select"
              loading={isAccountLoading}
              style={{ width: 'clamp(180px, 24vw, 280px)', maxWidth: 'calc(100vw - 1.5rem)' }}
              value={selectedAccount}
              open={isAccountMenuOpen}
              onOpenChange={setIsAccountMenuOpen}
              showSearch={{ optionFilterProp: 'label', onSearch }}
              placeholder="選擇 Minecraft 帳號"
              onChange={handleAccountChange}
              options={accountOptions}
              optionRender={(option) => {
                const account = option.data.account;
                return (
                  <div className="flex items-center gap-3 py-1">
                    <Avatar size={30} src={account.avatar} className="bg-cyan-700">{account.username[0]}</Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-100">{account.username}</div>
                      <div className="text-xs text-slate-400">{account.isExpired ? '需要重新登入' : '已連線'}</div>
                    </div>
                    <Tag color={account.isExpired ? 'warning' : 'success'}>{account.isExpired ? '過期' : '有效'}</Tag>
                  </div>
                );
              }}
              popupRender={(menu) => (
                <div className="w-full max-w-[calc(100vw-2rem)] rounded-xl bg-[#071b38] p-1">
                  {menu}
                  <Divider className="my-2 border-slate-700" />
                  {selectedAccountInfo?.isExpired && (
                    <div className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      此帳號的 Minecraft 金鑰已過期，請重新登入。
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="text" icon={<PlusOutlined />} className="flex-1 text-slate-200" onMouseDown={(event) => event.preventDefault()} onClick={login}>
                      新增帳號
                    </Button>
                    <Button type="text" danger icon={<LogoutOutlined />} disabled={!selectedAccount} onMouseDown={(event) => event.preventDefault()} onClick={logout}>
                      登出
                    </Button>
                  </div>
                </div>
              )}
            />
          </ConfigProvider>
        </div>

        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/instances" element={<Instances />} />

          <Route path="/settings" element={<Settings />} />
        </Routes>

      </Content>

    </Layout>
  );
};


export default App;