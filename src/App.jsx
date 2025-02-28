import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';
import debounce from 'lodash.debounce'; // Import debounce

const FlashblocksApp = () => {
    console.log("FlashblocksApp RE-RENDER"); // Log 1: Component re-render

    // State management - store only the latest blocks, not arrays
    const [latestFullBlock, setLatestFullBlock] = useState(null);
    const [latestFlashBlock, setLatestFlashBlock] = useState(null);
    const [activeTab, setActiveTab] = useState('comparison'); // Default to comparison tab
    const [txHash, setTxHash] = useState('');
    const [txStatus, setTxStatus] = useState(null);
    const [userAddress, setUserAddress] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef(null);
    const fullBlockTimerRef = useRef(null);

    // Connect to MetaMask (no changes needed)
    const connectWallet = async () => {
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                setUserAddress(accounts[0]);
                setIsConnected(true);
            } catch (error) {
                console.error("Error connecting to MetaMask", error);
            }
        } else {
            alert("Please install MetaMask to use this feature");
        }
    };

    // Submit a transaction (no changes needed)
    const submitTransaction = async () => {
        if (!isConnected) {
            alert("Please connect your wallet first");
            return;
        }
        setTxStatus("Preparing transaction...");
        try {
            const params = [{
                from: userAddress,
                to: userAddress, // Sending to yourself for testing
                value: "0x1", // Minimal value
                gas: "0x5208", // 21000 gas
            }];
            // Start timing
            const startTime = Date.now();
            // Send transaction
            const txHash = await window.ethereum.request({
                method: 'eth_sendTransaction',
                params,
            });
            setTxHash(txHash);
            setTxStatus("Transaction submitted, waiting for confirmation...");
            // Polling logic remains the same
            let flashBlockConfirmTime = null;
            let fullBlockConfirmTime = null;
            const checkReceipt = async () => {
                // Check flashblocks
                if (!flashBlockConfirmTime) {
                    const flashResponse = await fetch('https://sepolia-preconf.base.org', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            method: 'eth_getTransactionReceipt',
                            params: [txHash],
                            id: 1
                        })
                    });
                    const flashData = await flashResponse.json();
                    if (flashData.result && flashData.result.blockNumber) {
                        flashBlockConfirmTime = Date.now() - startTime;
                        setTxStatus(prev => prev + `\nConfirmed in flashblock after ${flashBlockConfirmTime}ms`);
                    }
                }
                // If both confirmations received, stop polling
                if (flashBlockConfirmTime && fullBlockConfirmTime) {
                    return;
                }
                // Continue polling
                setTimeout(checkReceipt, 100);
            };
            checkReceipt();
        } catch (error) {
            console.error("Error submitting transaction", error);
            setTxStatus(`Error: ${error.message}`);
        }
    };

    // --- Debounced State Setters ---
    const debouncedSetFlashBlock = useCallback(debounce((data) => {
        setLatestFlashBlock(data);
        console.log("setLatestFlashBlock DEBOUNCED", data); // Log 2a: Debounced Flashblock state update
    }, 200), []); // Increased debounce to 200ms

    const debouncedSetFullBlock = useCallback(debounce((data) => {
        setLatestFullBlock(data.result);
        console.log("setLatestFullBlock DEBOUNCED", data.result); // Log 2b: Debounced Fullblock state update
    }, 400), []); // Increased debounce to 400ms


    // Initialize WebSocket connection for flashblocks - update latestFlashBlock (using debounced setter)
    useEffect(() => {
        wsRef.current = new WebSocket('wss://sepolia.flashblocks.base.org/ws');
        wsRef.current.onopen = () => {
            console.log('WebSocket Connected');
        };
        wsRef.current.onmessage = (event) => {
            if (!event.data) {
                console.warn("WebSocket message received with empty data. Ignoring.");
                return;
            }
            if (event.data instanceof Blob) {
                event.data.text().then(text => {
                    try {
                        const data = JSON.parse(text);
                        console.log("WebSocket Data (Parsed from Blob):", data);
                        debouncedSetFlashBlock(data); // Use debounced setter for flashblocks
                    } catch (parseError) {
                        console.error('Error parsing JSON from Blob data:', parseError);
                        console.error('Problematic Blob Text Data:', text);
                    }
                }).catch(blobError => {
                    console.error('Error reading Blob as text:', blobError);
                });
            } else if (typeof event.data === 'string') {
                try {
                    const data = JSON.parse(event.data);
                    console.log("WebSocket Data (String):", data);
                    debouncedSetFlashBlock(data); // Use debounced setter for flashblocks
                } catch (parseError) {
                    console.error('Error parsing JSON from string data:', parseError);
                    console.error('Problematic String Data:', event.data);
                }
            } else {
                console.warn("WebSocket message data is not a Blob or string, cannot parse as JSON.");
                console.log("Data type received:", typeof event.data);
                console.log("Raw data received:", event.data);
            }
        };
        wsRef.current.onerror = (error) => {
            console.error('WebSocket Error', error);
        };
        wsRef.current.onclose = () => {
            console.log('WebSocket Disconnected');
        };
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [debouncedSetFlashBlock]); // Add debouncedSetFlashBlock to dependency array

    // Fetch full blocks periodically - update latestFullBlock (using debounced setter)
    useEffect(() => {
        const fetchFullBlock = async () => {
            try {
                const response = await fetch('https://sepolia-preconf.base.org', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_getBlockByNumber',
                        params: ['latest', true],
                        id: 1
                    })
                });
                const data = await response.json();
                if (data.result) {
                    debouncedSetFullBlock(data); // Use debounced setter for full blocks
                }
            } catch (error) {
                console.error('Error fetching full block', error);
            }
        };
        fetchFullBlock();
        fullBlockTimerRef.current = setInterval(fetchFullBlock, 2000);
        return () => {
            if (fullBlockTimerRef.current) {
                clearInterval(fullBlockTimerRef.current);
            }
        };
    }, [debouncedSetFullBlock]); // Add debouncedSetFullBlock to dependency array


    // Format block data for display (modified to handle single blocks) - No changes needed here for debugging
    const formatBlock = (block, isFlashBlock = false) => {
        if (!block) {
            return <p className="text-gray-300">Waiting for {isFlashBlock ? 'Flashblock' : 'Full Block'}...</p>;
        }

        const blockStyle = {
            minHeight: '220px', // Adjusted minHeight for 2 transactions
            willChange: 'transform',
            /* transition: 'height 0.1s ease-in-out, padding 0.1s ease-in-out',  Transition TEMPORARILY REMOVED */
            padding: '1rem',
            boxSizing: 'border-box',
            backgroundColor: '#111827', // Dark background
            color: '#f9fafb', // Light text
        };

        const maxTransactionsToShow = 2; // Display only 2 transactions

        const renderTransactionListItems = (transactions) => {
            const items = [];
            if (transactions && transactions.length > 0) {
                for (let i = 0; i < maxTransactionsToShow; i++) {
                    const txHash = transactions[i];
                    if (txHash) {
                        items.push(
                            <li key={i} className="text-sm break-all text-gray-100">{txHash.substring(0, 10)}...{txHash.substring(58)}</li>
                        );
                    } else {
                        items.push(<li key={`empty-${i}`} className="text-sm text-gray-500">- No Transaction -</li>);
                    }
                }
                if (transactions.length > maxTransactionsToShow) {
                    items.push(
                        <li key="more" className="text-sm text-gray-500">...and {transactions.length - maxTransactionsToShow} more</li>
                    );
                }
            } else {
                // If no transactions at all, render placeholders
                for (let i = 0; i < maxTransactionsToShow; i++) {
                    items.push(<li key={`empty-${i}`} className="text-sm text-gray-500">- No Transaction -</li>);
                }
            }
            return <ul className="mt-2">{items}</ul>; // Added mt-2 for spacing
        };


        // For initial flashblocks response
        if (isFlashBlock && block.index === 0) {
            return (
                <div key={`flashblock-initial-${block?.payload_id}`} className="rounded-lg shadow mb-4" style={blockStyle}>
                    <h3 className="text-lg font-semibold mb-2 text-blue-400">Latest Flashblock</h3> {/* Neon blue for Flashblock heading */}
                    <p className="mb-1"><span className="font-medium text-gray-100">Number:</span> {parseInt(block.number, 16)}</p>
                    <p className="mb-1"><span className="font-medium text-gray-100">Time:</span> {new Date(block.timestamp * 1000).toLocaleTimeString()}</p>
                    <p className="mb-1"><span className="font-medium text-gray-100">Transactions:</span> {block.transactions?.length || 0}</p>
                    <div>
                        <h4 className="text-md font-semibold mt-2 mb-1 text-gray-100">Transactions:</h4>
                        {renderTransactionListItems(block.transactions)}
                    </div>
                    <p className="text-xs text-gray-400">200ms block time</p>
                </div>
            );
        }
        // For diff flashblocks
        if (isFlashBlock) {
            return (
                <div key={`flashblock-diff-${block?.payload_id}-${block?.index}`} className="rounded-lg shadow mb-4 border-l-4 border-blue-500" style={blockStyle}>
                    <h3 className="text-lg font-semibold mb-2 text-blue-400">Latest Flashblock</h3> {/* Neon blue for Flashblock heading */}
                    <p className="mb-1"><span className="font-medium text-gray-100">Diff Type:</span> {block.diffType}</p>
                    <p className="mb-1"><span className="font-medium text-gray-100">Transactions:</span> {block.diff?.transactions?.length || 0}</p>
                    <div>
                        <h4 className="text-md font-semibold mt-2 mb-1 text-gray-100">Transactions:</h4>
                        {renderTransactionListItems(block.diff?.transactions)}
                    </div>
                    <p className="text-xs text-gray-400">200ms block time</p>
                </div>
            );
        }
        // For full blocks
        return (
            <div key={`fullblock-${block?.hash}`} className="rounded-lg shadow mb-4 border-l-4 border-green-500" style={blockStyle}>
                <h3 className="text-lg font-semibold mb-2 text-green-400">Latest Full Block</h3> {/* Neon green for Full Block heading */}
                <p className="mb-1"><span className="font-medium text-gray-100">Hash:</span> {block.hash.substring(0, 10)}...{block.hash.substring(58)}</p>
                <p className="mb-1"><span className="font-medium text-gray-100">Time:</span> {new Date(parseInt(block.timestamp, 16) * 1000).toLocaleTimeString()}</p>
                <p className="mb-1"><span className="font-medium text-gray-100">Transactions:</span> {block.transactions?.length || 0}</p>
                <p className="text-xs text-gray-400">2s block time</p>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 p-4"> {/* Dark background for the whole app */}
            <div className="max-w-3xl mx-auto"> {/* Constrain and center the content */}
                <div className="bg-gray-800 text-white p-6 rounded-lg shadow-lg mb-6"> {/* Darker header background */}
                    <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-blue-500">Flashblocks Explorer</h1> {/* Neon blue for header text */}
                        <div className="flex items-center">
                            <Clock className="mr-2 text-gray-300" />
                            <span className="text-sm font-medium text-gray-300">200ms vs 2s</span>
                        </div>
                    </div>
                    <p className="mt-2 text-blue-100">Compare the speed of Flashblocks vs standard blocks on Base Sepolia</p>
                </div>

                {/* Transaction Section */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6 text-white"> {/* Darker section background, light text */}
                    <h2 className="text-xl font-semibold mb-4 text-white">Submit Transaction (Bonus)</h2>
                    {!isConnected ? (
                        <button
                            onClick={connectWallet}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                        >
                            Connect Wallet
                        </button>
                    ) : (
                        <div>
                            <p className="mb-4 text-gray-100">Connected: {userAddress.substring(0, 6)}...{userAddress.substring(38)}</p>
                            <button
                                onClick={submitTransaction}
                                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                            >
                                Send Test Transaction
                            </button>
                        </div>
                    )}

                    {txHash && (
                        <div className="mt-4 p-4 bg-gray-700 rounded"> {/* Even darker for transaction info */}
                            <p className="font-medium text-gray-100">Transaction Hash:</p>
                            <p className="text-sm break-all text-gray-200">{txHash}</p>
                            <div className="mt-2">
                                <p className="font-medium text-gray-100">Status:</p>
                                <pre className="text-sm bg-gray-600 p-2 rounded whitespace-pre-wrap text-gray-200">{txStatus}</pre>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs for block types */}
                <div className="mb-4">
                    <div className="flex border-b border-gray-700"> {/* Darker border for tabs */}
                        <button
                            className={`py-2 px-4 ${activeTab === 'flashblocks' ? 'border-b-2 border-blue-500 font-medium text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            onClick={() => setActiveTab('flashblocks')}
                        >
                            Flashblocks (200ms) - *Not Used in Comparison View*
                        </button>
                        <button
                            className={`py-2 px-4 ${activeTab === 'fullblocks' ? 'border-b-2 border-blue-500 font-medium text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            onClick={() => setActiveTab('fullblocks')}
                        >
                            Full Blocks (2s) - *Not Used in Comparison View*
                        </button>
                        <button
                            className={`py-2 px-4 ${activeTab === 'comparison' ? 'border-b-2 border-blue-500 font-medium text-white' : 'text-gray-500 hover:text-gray-300'}`}
                            onClick={() => setActiveTab('comparison')}
                        >
                            Comparison View (Flash vs Full Block)
                        </button>
                    </div>
                </div>

                {/* Content based on active tab */}
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg"> {/* Darker main content background */}
                    {activeTab === 'flashblocks' && (
                        <>
                            <h2 className="text-xl font-semibold mb-4 text-white">Flashblocks Stream (200ms) - *Individual Stream View*</h2>
                            {formatBlock(latestFlashBlock, true)}
                        </>
                    )}

                    {activeTab === 'fullblocks' && (
                        <>
                            <h2 className="text-xl font-semibold mb-4 text-white">Full Blocks Stream (2s) - *Individual Stream View*</h2>
                            {formatBlock(latestFullBlock, false)}
                        </>
                    )}

                    {activeTab === 'comparison' && (
                        <>
                            <h2 className="text-xl font-semibold mb-4 text-white">Real-time Block Comparison</h2>
                            <div className="mb-4">
                                <h3 className="font-medium text-lg mb-2 text-blue-400">Latest Flashblock (200ms)</h3> {/* Neon blue heading */}
                                {formatBlock(latestFlashBlock, true)}
                            </div>
                            <div>
                                <h3 className="font-medium text-lg mb-2 text-green-400">Latest Full Block (2s)</h3> {/* Neon green heading */}
                                {formatBlock(latestFullBlock, false)}
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-6 text-center text-sm text-gray-500">
                    <p>Built for Flashblocks Builder Side Quest - ETH Denver 2025</p>
                </div>
            </div>
        </div>
    );
};

export default FlashblocksApp;
