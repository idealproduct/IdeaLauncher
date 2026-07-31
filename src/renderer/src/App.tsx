import React from 'react';
import {
  FolderOutlined,
  HomeFilled,
  SettingOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { ConfigProvider, Layout, Menu } from 'antd';
import october from './assets/october.png';
import { Route, Routes, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import Instances from './pages/Instances';
import Settings from './pages/Settings';


const { Sider, Content } = Layout;


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
  const navigate = useNavigate();

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
        className="bg-cover bg-center w-full h-full"
        style={{
          backgroundImage: `url(${october})`,
        }}
      >
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