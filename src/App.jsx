import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';
import debounce from 'lodash.debounce'; // Import debounce

// Import Material UI components and theming
import {
    ThemeProvider,
    createTheme,
    CssBaseline,
    Box,
    Typography,
    Container,
    Button,
    Grid,
    Paper,
    Tabs,
    Tab,
    List,
    ListItem,
} from '@mui/material';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#90caf9', // Light Blue
        },
        secondary: {
            main: '#a5d6a7', // Light Green
        },
        background: {
            default: '#121212', // Darker background
            paper: '#1e1e1e', // Slightly lighter paper background
        },
        text: {
            primary: '#e0e0e0', // Off-white text
            secondary: '#bdbdbd', // Lighter grey text
        },
    },
    typography: {
        fontFamily: "'Roboto Mono', monospace", // Optional: Monospace font for a Web3 feel
        h1: {
            fontWeight: 700,
        },
        h2: {
            fontWeight: 600,
        },
        // ... you can customize other typography variants
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                rounded: {
                    borderRadius: '12px', // More rounded corners for Paper
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: '8px', // Rounded buttons
                    textTransform: 'none', // Prevent uppercase button text
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    backgroundColor: '#90caf9', // Blue indicator for tabs
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none', // Prevent uppercase tab text
                    fontWeight: 500,
                    '&.Mui-selected': {
                        color: '#90caf9', // Blue text for selected tab
                    },
                },
            },
        },
        // ... you can customize other MUI components globally
    },
});


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


    // Format Block Data - Now using MUI Typography and Paper
    const formatBlock = (block, isFlashBlock = false) => {
        if (!block) {
            return (
                <Paper elevation={2} sx={{ p: 3, textAlign: 'center', minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                        Waiting for {isFlashblock ? 'Flashblock' : 'Full Block'}...
                    </Typography>
                </Paper>
            );
        }

        const maxTransactionsToShow = 2;

        const renderTransactionListItems = (transactions) => {
            const items = [];
            if (transactions && transactions.length > 0) {
                for (let i = 0; i < maxTransactionsToShow; i++) {
                    const txHashOrObject = transactions[i];
                    let txHash = txHashOrObject;
                    if (txHashOrObject && typeof txHashOrObject === 'object' && txHashOrObject.hash) {
                        txHash = txHashOrObject.hash;
                    }
                    if (txHash) {
                        items.push(
                            <ListItem key={i} disablePadding>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                        overflowWrap: 'break-word', // Keep this - good for normal word wrapping
                                        wordBreak: 'break-all',    // ADD THIS - more aggressive breaking
                                        fontFamily: 'monospace'
                                    }}
                                >
                                    {txHash}
                                </Typography>
                            </ListItem>
                        );
                    } else {
                        items.push(
                            <ListItem key={`empty-${i}`} disablePadding>
                                <Typography variant="body2" color="text.disabled">- No Tx -</Typography>
                            </ListItem>
                        );
                    }
                }
                if (transactions.length > maxTransactionsToShow) {
                    items.push(
                        <ListItem key="more" disablePadding>
                            <Typography variant="body2" color="text.disabled">...and {transactions.length - maxTransactionsToShow} more</Typography>
                        </ListItem>
                    );
                }
            } else {
                for (let i = 0; i < maxTransactionsToShow; i++) {
                    items.push(
                        <ListItem key={`empty-${i}`} disablePadding>
                            <Typography variant="body2" color="text.disabled">- No Tx -</Typography>
                        </ListItem>
                    );
                }
            }
            return (
                <List dense sx={{ mt: 2 }}>
                    {items}
                </List>
            );
        };


        return (
            <Paper elevation={3} rounded sx={{ p: 3, mb: 4, borderLeft: `4px solid ${isFlashBlock ? '#64b5f6' : '#81c784'}` }}>
                <Typography variant="h6" component="h3" gutterBottom color={isFlashBlock ? 'primary' : 'secondary'}>
                    {isFlashBlock ? 'Flashblock' : 'Full Block'}
                </Typography>
                <Grid container spacing={2} mb={2}>
                    <Grid item xs={6}>
                        <Typography variant="subtitle2" color="text.primary">#</Typography>
                        <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                            {isFlashBlock ? parseInt(block.number, 16) : parseInt(block.number, 16)}
                        </Typography>
                    </Grid>
                    <Grid item xs={6}>
                        <Typography variant="subtitle2" color="text.primary">Time</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {new Date((isFlashBlock ? block.timestamp : parseInt(block.timestamp, 16)) * 1000).toLocaleTimeString()}
                        </Typography>
                    </Grid>
                    <Grid item xs={6}>
                        <Typography variant="subtitle2" color="text.primary">Txs</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {isFlashBlock ? block.transactions?.length : block.transactions?.length}
                        </Typography>
                    </Grid>
                    <Grid item xs={6}>
                        <Typography variant="subtitle2" color="text.primary">Type</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {isFlashBlock ? (block.diffType ? block.diffType : 'Initial') : 'Standard'}
                        </Typography>
                    </Grid>
                </Grid>
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }} color="text.primary">Transactions</Typography>
                {renderTransactionListItems(isFlashBlock ? (block.transactions || block.diff?.transactions) : block.transactions)}
                <Typography variant="caption" color="text.disabled" sx={{ mt: 2, fontStyle: 'italic' }}>
                    {isFlashBlock ? '~200ms block time' : '~2s block time'}
                </Typography>
            </Paper>
        );
    };


    return (
        <ThemeProvider theme={darkTheme}>
            <CssBaseline /> {/* Resets default browser styles for MUI */}
            <Container maxWidth="md" sx={{ pt: 4, pb: 8 }}> {/* Container for responsiveness */}
                <Box textAlign="center" mb={5}>
                    <Typography variant="h4" component="h1" color="primary" mb={2}>
                        Flashblocks Explorer
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                        Experience the speed of Flashblocks vs standard blocks on Base Sepolia
                    </Typography>
                    <Box mt={2} color="text.disabled" display="flex" alignItems="center" justifyContent="center">
                        <Clock style={{ marginRight: 8 }} size={16} /> <Typography variant="caption">200ms vs 2s</Typography>
                    </Box>
                </Box>


                <Box mb={4}>
                    <Tabs
                        value={activeTab}
                        onChange={(event, newValue) => setActiveTab(newValue)}
                        variant="fullWidth"
                        aria-label="block type tabs"
                    >
                        <Tab label="Comparison View" value="comparison" />
                        <Tab label="Flashblocks (200ms)" value="flashblocks" />
                        <Tab label="Full Blocks (2s)" value="fullblocks" />
                    </Tabs>
                </Box>


                <Box mb={6}>
                    {activeTab === 'flashblocks' && (
                        <Box>
                            <Typography variant="h6" align="center" gutterBottom color="primary">
                                Flashblocks Stream (200ms) - *Individual Stream View*
                            </Typography>
                            {formatBlock(latestFlashBlock, true)}
                        </Box>
                    )}

                    {activeTab === 'fullblocks' && (
                        <Box>
                            <Typography variant="h6" align="center" gutterBottom color="secondary">
                                Full Blocks Stream (2s) - *Individual Stream View*
                            </Typography>
                            {formatBlock(latestFullBlock, false)}
                        </Box>
                    )}

                    {activeTab === 'comparison' && (
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" align="center" gutterBottom color="primary">
                                    Latest Flashblock (200ms)
                                </Typography>
                                {formatBlock(latestFlashBlock, true)}
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" align="center" gutterBottom color="secondary">
                                    Latest Full Block (2s)
                                </Typography>
                                {formatBlock(latestFullBlock, false)}
                            </Grid>
                        </Grid>
                    )}
                </Box>


                <Paper elevation={2} sx={{ p: 3, mt: 8, textAlign: 'center', backgroundColor: 'background.paper' }}>
                    <Typography variant="h6" component="h2" gutterBottom color="text.primary">
                        Submit Transaction (Bonus)
                    </Typography>
                    <Typography variant="body2" color="text.secondary" paragraph>
                        Connect your wallet and submit a transaction to see confirmation times.
                    </Typography>
                    {!isConnected ? (
                        <Button variant="contained" color="primary" onClick={connectWallet}>
                            Connect Wallet
                        </Button>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                Connected: {userAddress.substring(0, 6)}...{userAddress.substring(38)}
                            </Typography>
                            <Button variant="contained" color="secondary" onClick={submitTransaction}>
                                Send Test Transaction
                            </Button>
                        </Box>
                    )}

                    {txHash && (
                        <Paper elevation={1} sx={{ mt: 4, p: 2, backgroundColor: 'background.default', color: 'text.secondary', borderRadius: '8px' }}>
                            <Typography variant="subtitle2" color="text.primary">Transaction Hash:</Typography>
                            <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>{txHash}</Typography>
                            <Box mt={2}>
                                <Typography variant="subtitle2" color="text.primary">Status:</Typography>
                                <Typography variant="body2" fontFamily="monospace" component="pre" sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary' }}>
                                    {txStatus}
                                </Typography>
                            </Box>
                        </Paper>
                    )}
                </Paper>


                <Box mt={10} textAlign="center" color="text.disabled" fontSize="small">
                    © {new Date().getFullYear()} Flashblocks Explorer. Built for ETH Denver 2025.
                </Box>
            </Container>
        </ThemeProvider>
    );
};

export default FlashblocksApp;
