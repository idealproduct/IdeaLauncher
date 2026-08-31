import React from 'react';
import {
  FolderOutlined,
  HomeFilled,
  PlusOutlined,
  SettingOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Button, ConfigProvider, Divider, Layout, Menu, Select } from 'antd';
import october from './assets/image.png';
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

const App: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>();
  const navigate = useNavigate();

  const handleAccountChange = (xuid: string) => {

    setSelectedAccount(xuid);

    const account = accounts.find(
        account => account.xboxXuid === xuid
    );

    console.log(account);

  };  

  const login = async () => {
    const account = await window.api.loginMicrosoft();

    console.log(account);

    setAccounts(await window.api.getAccounts());
  };

  useEffect(() => {

    const load = async () => {

        const list = await window.api.getAccounts();

        setAccounts(list);

    };

    load();

  }, []);


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

        <div className="absolute top-4 right-4 z-50">
          <Select
            style={{
                minWidth: 180,
              }}
            value={selectedAccount}
            showSearch={{optionFilterProp: 'label', onSearch}}
            placeholder="Select a person"
            onChange={handleAccountChange}
            options={accounts.map(account => ({
                value: account.xboxXuid,
                label: account.username,
            }))}
            popupRender={(menu) => (
              <>
                {menu}

                <Divider style={{ margin: "8px 0" }} />

                <Button
                  type="text"
                  icon={<PlusOutlined />}
                  block
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={login}
                >
                  新增帳號
                </Button>
              </>
            )}
          />
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