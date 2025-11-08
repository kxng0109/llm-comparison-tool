import React, { useState, useEffect } from 'react';
import PromptInput from './components/PromptInput';
import ResponseGrid from './components/ResponseGrid';
import DarkModeToggle from './components/DarkModeToggle';
import MetadataToggle from './components/MetaDataToggle';
import HealthIndicator from './components/HealthIndicator';
import { sendPromptToLLMs, getAvailableLLMs, checkHealth } from './services/api';

function App() {
    const [isLoading, setIsLoading] = useState(false);
    const [currentPrompt, setCurrentPrompt] = useState('');
    const [availableLLMs, setAvailableLLMs] = useState([]);
    const [selectedLLMs, setSelectedLLMs] = useState([]);
    const [responses, setResponses] = useState([]);
    const [showMetadata, setShowMetadata] = useState(false);
    const [backendHealthy, setBackendHealthy] = useState(null);

    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        if (saved !== null) {
            return saved === 'true';
        }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    useEffect(() => {
        const root = document.documentElement;

        if (darkMode) {
            root.classList.add('dark');
            root.style.colorScheme = 'dark';
        } else {
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }
        localStorage.setItem('darkMode', darkMode.toString());
    }, [darkMode]);

    useEffect(() => {
        const performHealthCheck = async () => {
            try {
                const healthy = await checkHealth();
                setBackendHealthy(healthy);
            } catch (error) {
                setBackendHealthy(false);
            }
        };

        performHealthCheck();
        const interval = setInterval(performHealthCheck, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const fetchLLMs = async () => {
            try {
                const llms = await getAvailableLLMs();
                if (llms && llms.length > 0) {
                    setAvailableLLMs(llms);

                    const selected = llms.slice(0, Math.min(3, llms.length));
                    setSelectedLLMs(selected);

                    setResponses(selected.map(llm => ({
                        llmName: llm.displayName || llm.name || llm,
                        llmId: llm.id || llm.name || llm,
                        response: null,
                        isLoading: false,
                        error: null,
                        metadata: null
                    })));
                } else {
                    const defaultLLM = { id: 'default', displayName: 'Default Model' };
                    setAvailableLLMs([defaultLLM]);
                    setSelectedLLMs([defaultLLM]);
                    setResponses([{
                        llmName: 'Default Model',
                        llmId: 'default',
                        response: null,
                        isLoading: false,
                        error: null,
                        metadata: null
                    }]);
                }
            } catch (error) {
                const defaultLLM = { id: 'default', displayName: 'Default Model' };
                setAvailableLLMs([defaultLLM]);
                setSelectedLLMs([defaultLLM]);
                setResponses([{
                    llmName: 'Default Model',
                    llmId: 'default',
                    response: null,
                    isLoading: false,
                    error: null,
                    metadata: null
                }]);
            }
        };

        fetchLLMs();
    }, []);

    const handleLLMSelection = (selectedIds) => {
        const selected = availableLLMs.filter(llm =>
            selectedIds.includes(llm.id || llm.name || llm)
        );

        if (selected.length === 0 && availableLLMs.length > 0) {
            selected.push(availableLLMs[0]);
        }

        setSelectedLLMs(selected);
        setResponses(selected.map(llm => ({
            llmName: llm.displayName || llm.name || llm,
            llmId: llm.id || llm.name || llm,
            response: null,
            isLoading: false,
            error: null,
            metadata: null
        })));
    };

    const handleSubmit = async (prompt) => {
        setCurrentPrompt(prompt);
        setIsLoading(true);

        setResponses(prev => prev.map(item => ({
            ...item,
            isLoading: true,
            error: null,
            response: null,
            metadata: null
        })));

        try {
            const llmIds = selectedLLMs.map(llm => llm.id || llm.name || llm);
            const data = await sendPromptToLLMs(prompt, llmIds);

            setBackendHealthy(true);

            if (data.responses && Array.isArray(data.responses) && data.responses.length > 0) {
                const newResponses = data.responses.map((responseData) => ({
                    llmName: responseData?.llmName || responseData?.llm || 'Unknown Model',
                    llmId: responseData?.llm || responseData?.llmName || 'unknown',
                    response: responseData?.response || responseData?.text || null,
                    isLoading: false,
                    error: responseData?.error || null,
                    metadata: {
                        promptTokens: responseData?.metadata?.promptTokens || responseData?.promptTokens || null,
                        generationTokens: responseData?.metadata?.generationTokens || responseData?.generationTokens || responseData?.completionTokens || null,
                        totalTokens: responseData?.metadata?.totalTokens || responseData?.totalTokens || null,
                        responseTime: responseData?.metadata?.responseTime || responseData?.responseTime || null,
                        model: responseData?.metadata?.model || responseData?.model || null,
                        finishReason: responseData?.metadata?.finishReason || responseData?.finishReason || null,
                        timestamp: responseData?.metadata?.timestamp || responseData?.timestamp || new Date().toISOString(),
                        rateLimit: responseData?.metadata?.rateLimit ? {
                            requestsLimit: responseData.metadata.rateLimit.requestsLimit || null,
                            requestsRemaining: responseData.metadata.rateLimit.requestsRemaining || null,
                            tokensLimit: responseData.metadata.rateLimit.tokensLimit || null,
                            tokensRemaining: responseData.metadata.rateLimit.tokensRemaining || null,
                            resetAfter: responseData.metadata.rateLimit.resetAfter || null
                        } : null
                    }
                }));
                setResponses(newResponses);
            } else {
                setResponses([{
                    llmName: 'Default Model',
                    llmId: 'default',
                    response: 'No response received from server',
                    isLoading: false,
                    error: null,
                    metadata: null
                }]);
            }
        } catch (error) {
            setBackendHealthy(false);

            setResponses(prev => prev.length > 0 ? prev.map(item => ({
                ...item,
                isLoading: false,
                error: error.response?.data?.message || error.message || 'Failed to get response from LLM',
                metadata: null
            })) : [{
                llmName: 'Default Model',
                llmId: 'default',
                response: null,
                isLoading: false,
                error: error.response?.data?.message || error.message || 'Failed to get response',
                metadata: null
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDarkMode = () => {
        setDarkMode(prev => !prev);
    };

    const toggleMetadata = () => {
        setShowMetadata(prev => !prev);
    };

    const capitalizeModelName = (name) => {
        if (!name) return '';
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 py-8 sm:py-12 px-3 sm:px-6 lg:px-8 transition-colors duration-300">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-8 sm:mb-12 mt-4 sm:mt-8 relative">
                    <DarkModeToggle darkMode={darkMode} onToggle={toggleDarkMode} />
                    <MetadataToggle showMetadata={showMetadata} onToggle={toggleMetadata} />

                    <div className="mb-4">
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-3 sm:mb-4 px-2 leading-tight">
                            LLM Comparison Tool
                        </h1>
                        <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base md:text-lg px-4 max-w-2xl mx-auto font-light">
                            Compare responses from multiple AI models side-by-side
                        </p>
                    </div>
                </header>

                {availableLLMs.length > 1 && (
                    <div className="max-w-7xl mx-auto mb-6 sm:mb-8">
                        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg p-5 sm:p-7 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 hover:shadow-xl">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                                Select Models:
                            </h3>
                            <div className="flex flex-wrap gap-2 sm:gap-3">
                                {availableLLMs.map((llm) => {
                                    const llmId = llm.id || llm.name || llm;
                                    const displayName = llm.displayName || llm.name || llm;
                                    const isSelected = selectedLLMs.some(selected =>
                                        (selected.id || selected.name || selected) === llmId
                                    );
                                    return (
                                        <button
                                            key={llmId}
                                            onClick={() => {
                                                if (isSelected) {
                                                    if (selectedLLMs.length === 1) return;
                                                    const newSelection = selectedLLMs.filter(s =>
                                                        (s.id || s.name || s) !== llmId
                                                    );
                                                    handleLLMSelection(newSelection.map(s => s.id || s.name || s));
                                                } else {
                                                    handleLLMSelection([...selectedLLMs.map(s => s.id || s.name || s), llmId]);
                                                }
                                            }}
                                            className={`px-4 py-2.5 sm:px-5 sm:py-3 rounded-lg font-medium transition-all duration-200 text-sm sm:text-base ${
                                                isSelected
                                                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md hover:shadow-lg transform hover:scale-105'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 shadow-sm'
                                            }`}
                                        >
                                            {capitalizeModelName(displayName)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <PromptInput onSubmit={handleSubmit} isLoading={isLoading} />

                {currentPrompt && (
                    <div className="max-w-7xl mx-auto mb-6 sm:mb-8">
                        <div className="bg-blue-50/80 dark:bg-blue-900/20 backdrop-blur-sm border-l-4 border-indigo-500 rounded-lg p-4 sm:p-5 transition-colors duration-200 shadow-sm">
                            <p className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Current Prompt:
                            </p>
                            <p className="text-sm sm:text-base text-gray-800 dark:text-gray-200">{currentPrompt}</p>
                        </div>
                    </div>
                )}

                {responses.length > 0 && <ResponseGrid responses={responses} showMetadata={showMetadata} />}
            </div>

            <HealthIndicator isHealthy={backendHealthy} />

            <footer className="text-center mt-12 sm:mt-16 text-gray-500 dark:text-gray-400 text-xs sm:text-sm px-4">
                <p className="font-light">Built with React + Vite + TailwindCSS</p>
                <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">by @kxng0109</p>
            </footer>
        </div>
    );
}

export default App;