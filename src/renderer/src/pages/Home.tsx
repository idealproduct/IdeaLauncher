import { ArrowRightOutlined, FolderOutlined, SettingOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

export default function Home(): React.JSX.Element {
  return (
    <main className="launcher-page home-page">
      <div className="page-eyebrow">YOUR NEXT ADVENTURE</div>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="hero-tag"><span /> MINECRAFT · YOUR WAY</span>
          <h1>每個世界，<br /><span>都是新的開始。</span></h1>
          <p>從熟悉的原版到無限可能的模組世界。<br />管理遊戲實例，開啟屬於你的下一場冒險。</p>
          <Link className="primary-link" to="/instances">前往遊戲實例 <ArrowRightOutlined /></Link>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="voxel voxel-back" /><div className="voxel voxel-front" /><span className="art-caption">BUILD. EXPLORE. CREATE.</span></div>
      </section>
      <div className="home-section-heading"><h2>你的啟動空間</h2><span>讓冒險井然有序</span></div>
      <div className="home-shortcuts">
        <Link to="/instances" className="shortcut-card"><FolderOutlined /><div><h3>遊戲實例</h3><p>建立、設定與啟動你的 Minecraft 實例</p></div><ArrowRightOutlined /></Link>
        <Link to="/settings" className="shortcut-card"><SettingOutlined /><div><h3>全域設定</h3><p>管理記憶體、顯示卡與 Java 的全域預設值</p></div><ArrowRightOutlined /></Link>
      </div>
    </main>
  );
}
