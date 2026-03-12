import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import NotificationToast from './components/NotificationToast';
import AgentPage from './pages/AgentPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CoinsPage from './pages/CoinsPage';
import ContractsPage from './pages/ContractsPage';
import DashboardPage from './pages/DashboardPage';
import HeatmapPage from './pages/HeatmapPage';
import HistoryPage from './pages/HistoryPage';
import LandingPage from './pages/LandingPage';
import SettingsPage from './pages/SettingsPage';

function App() {
    return (
        <Router>
            <NotificationToast />
            <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/coins" element={<CoinsPage />} />
                <Route path="/agent" element={<AgentPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/contracts" element={<ContractsPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/heatmap" element={<HeatmapPage />} />
            </Routes>
        </Router>
    );
}

export default App;
