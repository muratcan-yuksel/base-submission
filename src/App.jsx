import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';
import debounce from 'lodash.debounce';
import { motion, AnimatePresence } from 'framer-motion';

import {
    ThemeProvider,
    createTheme,
    CssBaseline,
    Box,
    Typography,
    Container,
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
            main: '#90caf9',
        },
        secondary: {
            main: '#a5d6a7',
        },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
        text: {
            primary: '#e0e0e0',
            secondary: '#bdbdbd',
        },
    },
    typography: {
        fontFamily: "'Roboto Mono', monospace",
        h1: {
            fontWeight: 700,
        },
        h2: {
            fontWeight: 600,
        },
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                rounded: {
                    borderRadius: '12px',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: '8px',
                    textTransform: 'none',
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    backgroundColor: '#90caf9',
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 500,
                    '&.Mui-selected': {
                        color: '#90caf9',
                    },
                },
            },
        },
    },
});

// Animation variants for new block notification (FLICKER animation)
const flashVariants = {
    initial: {
        boxShadow: "0px 0px 0px rgba(144, 202, 249, 0)",
        borderColor: "rgba(144, 202, 249, 0.6)"
    },
    animate: {
        boxShadow: [
            "0px 0px 0px rgba(144, 202, 249, 0)",
            "0px 0px 20px rgba(144, 202, 249, 0.8)",
            "0px 0px 0px rgba(144, 202, 249, 0)"
        ],
        borderColor: [
            "rgba(144, 202, 249, 0.6)",
            "rgba(144, 202, 249, 1)",
            "rgba(144, 202, 249, 0.6)"
        ],
        transition: {
            duration: 1.5,
            times: [0, 0.5, 1],
            repeat: 0
        }
    }
};

const transactionVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: i => ({
        opacity: 1,
        x: 0,
        transition: {
            delay: i * 0.1,
            duration: 0.5
        }
    })
};

const FlashblocksApp = () => {
    console.log("FlashblocksApp RE-RENDER");

    const [latestFullBlock, setLatestFullBlock] = useState(null);
    const [latestFlashBlock, setLatestFlashBlock] = useState(null);
    const [activeTab, setActiveTab] = useState('comparison');
    const wsRef = useRef(null);
    const fullBlockTimerRef = useRef(null);

    const [flashBlockAnimationKey, setFlashBlockAnimationKey] = useState(0);
    const [fullBlockAnimationKey, setFullBlockAnimationKey] = useState(0);

    const previousFlashBlockRef = useRef(null);
    const previousFullBlockRef = useRef(null);


    const debouncedSetFlashBlock = useCallback(debounce((data) => {
        const newBlockNumber = data.number;
        if (previousFlashBlockRef.current !== newBlockNumber) {
            setLatestFlashBlock(data);
            setFlashBlockAnimationKey(prev => prev + 1);
            previousFlashBlockRef.current = newBlockNumber;
            console.log("setLatestFlashBlock DEBOUNCED with animation", data);
        } else {
            setLatestFlashBlock(data);
            console.log("setLatestFlashBlock DEBOUNCED (no animation)", data);
        }
    }, 200), []);

    const debouncedSetFullBlock = useCallback(debounce((data) => {
        const newBlockNumber = data.result?.number;
        if (previousFullBlockRef.current !== newBlockNumber) {
            setLatestFullBlock(data.result);
            setFullBlockAnimationKey(prev => prev + 1);
            previousFullBlockRef.current = newBlockNumber;
            console.log("setLatestFullBlock DEBOUNCED with animation", data.result);
        } else {
            setLatestFullBlock(data.result);
            console.log("setLatestFullBlock DEBOUNCED (no animation)", data);
        }
    }, 400), []);

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
                        debouncedSetFlashBlock(data);
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
                    debouncedSetFlashBlock(data);
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
    }, [debouncedSetFlashBlock]);

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
                    debouncedSetFullBlock(data);
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
    }, [debouncedSetFullBlock]);

    const renderTransactionListItems = (transactions, truncateInFlashblocksTab = false) => {
        const truncateHash = (hash, startLength, endLength) => { // Modified to accept startLength and endLength
            if (!hash) return '';
            if (hash.length <= startLength + endLength + 3) return hash;
            return `${hash.substring(0, startLength)}...${hash.substring(hash.length - endLength)}`;
        };

        const maxTransactionsToShow = 2;
        const items = [];
        if (transactions && transactions.length > 0) {
            for (let i = 0; i < maxTransactionsToShow; i++) {
                const txHashOrObject = transactions[i];
                let txHash = txHashOrObject;
                if (txHashOrObject && typeof txHashOrObject === 'object' && txHashOrObject.hash) {
                    txHash = txHashOrObject.hash;
                }
                let displayTxHash = txHash; // Default to full hash
                if (txHash) {
                    if (activeTab === 'comparison') {
                        displayTxHash = truncateHash(txHash, 6, 24); // Truncate in comparison view
                    } else if (activeTab === 'flashblocks' || truncateInFlashblocksTab) {
                        displayTxHash = truncateHash(txHash, 6, 84); // Shorter truncation for flashblocks tab
                    }

                    items.push(
                        <motion.div
                            key={i}
                            custom={i}
                            initial="hidden"
                            animate="visible"
                            variants={transactionVariants}

                        >
                            <ListItem disablePadding>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                        overflowWrap: 'break-word',
                                        wordBreak: 'break-all',
                                        fontFamily: 'monospace'
                                    }}
                                >
                                    {displayTxHash}
                                </Typography>
                            </ListItem>
                        </motion.div>
                    );
                } else {
                    items.push(
                        <motion.div
                            key={`empty-${i}`}
                            custom={i}
                            initial="hidden"
                            animate="visible"
                            variants={transactionVariants}
                        >
                            <ListItem disablePadding>
                                <Typography variant="body2" color="text.disabled">- No Tx -</Typography>
                            </ListItem>
                        </motion.div>
                    );
                }
            }
            if (transactions.length > maxTransactionsToShow) {
                items.push(
                    <motion.div
                        key="more"
                        custom={maxTransactionsToShow}
                        initial="hidden"
                        animate="visible"
                        variants={transactionVariants}
                    >
                        <ListItem disablePadding>
                            <Typography variant="body2" color="text.disabled">...and {transactions.length - maxTransactionsToShow} more</Typography>
                        </ListItem>
                    </motion.div>
                );
            }
        } else {
            for (let i = 0; i < maxTransactionsToShow; i++) {
                items.push(
                    <motion.div
                        key={`empty-${i}`}
                        custom={i}
                        initial="hidden"
                        animate="visible"
                        variants={transactionVariants}
                    >
                        <ListItem disablePadding>
                            <Typography variant="body2" color="text.disabled">- No Tx -</Typography>
                            </ListItem>
                    </motion.div>
                );
            }
        }
        return (
            <List dense sx={{ mt: 2 }}>
                {items}
            </List>
        );
    };


    const formatFlashBlockData = (block) => {
        if (!block) return null;

        const blockNumber = block.index === 0 ? parseInt(block.base?.block_number, 16) : block.metadata?.block_number;
        const timestamp = block.index === 0 ? parseInt(block.base?.timestamp, 16) : null; // Timestamp only in initial block
        const transactionsList = block.diff?.transactions;
        const diffType = block.diffType || (block.index === 0 ? 'Initial' : 'Diff'); // Determine Diff type

         let actualTimestamp = timestamp;
        if (actualTimestamp === null && latestFlashBlock && latestFlashBlock.index === 0) {
            actualTimestamp = parseInt(latestFlashBlock.base?.timestamp, 16); // Use timestamp from the initial block if diff block
        }


        return {
            blockType: 'Flashblock',
            blockNumber: isNaN(blockNumber) ? 'N/A' : blockNumber,
            timestamp: actualTimestamp,
            transactionsList: transactionsList || [],
            extraInfo : diffType
        };
    };

    const formatFullBlockData = (block) => {
        if (!block) return null;
        return {
            blockType: 'Full Block',
            blockNumber: parseInt(block.number, 16),
            timestamp: parseInt(block.timestamp, 16),
            transactionsList: block.transactions || [],
            extraInfo: 'Standard'
        };
    };


    const formatBlock = (block, isFlashBlock = false, animationKey) => {
        if (!block) {
            return (
                <Paper elevation={2} sx={{ p: 3, textAlign: 'center', minHeight: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                        Waiting for {isFlashBlock ? 'Flashblock' : 'Full Block'}...
                    </Typography>
                </Paper>
            );
        }

        const pulseColor = isFlashBlock ?
            "rgba(144, 202, 249, 0.8)" :
            "rgba(165, 214, 167, 0.8)";

        const customFlashVariants = {
            ...flashVariants,
            animate: {
                backgroundColor: [
                    "rgba(0, 0, 0, 0)",
                    pulseColor,
                    "rgba(0, 0, 0, 0)",
                    pulseColor,
                    "rgba(0, 0, 0, 0)"
                ],
                transition: {
                    duration: 0.2,
                    times: [0, 0.2, 0.4, 0.6, 1],
                    repeat: 0,
                    repeatType: 'loop'
                }
            },
            initial: { backgroundColor: "rgba(0, 0, 0, 0)" }
        };


        const blockData = isFlashBlock ? formatFlashBlockData(block) : formatFullBlockData(block);
        if (!blockData) return null; // Handle cases where formatting returns null (e.g., initial wait)


        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key={animationKey}
                >
                    <motion.div
                        initial="initial"
                        animate="animate"
                        variants={customFlashVariants}
                        style={{
                            borderRadius: '12px',
                        }}
                    >
                        <Paper
                            elevation={3}
                            sx={{
                                p: 3,
                                mb: 4,
                                borderLeft: `4px solid ${isFlashBlock ? '#64b5f6' : '#81c784'}`,
                                borderRadius: '12px',
                                background: `${isFlashBlock ? 'linear-gradient(to right, rgba(100, 181, 246, 0.05), transparent)' : 'linear-gradient(to right, rgba(129, 199, 132, 0.05), transparent)'}`
                            }}
                        >
                            <Typography variant="h6" component="h3" gutterBottom color={isFlashBlock ? 'primary' : 'secondary'}>
                                {blockData.blockType}
                            </Typography>
                            <Grid container spacing={2} mb={2}>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.primary">#</Typography>
                                    <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                                        {blockData.blockNumber}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.primary">Time</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {blockData.timestamp ? new Date(blockData.timestamp * 1000).toLocaleTimeString() : 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.primary">Txs</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {blockData.transactionsList ? blockData.transactionsList.length : 0}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.primary">Type</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {blockData.extraInfo}
                                    </Typography>
                                </Grid>
                            </Grid>
                            <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }} color="text.primary">Transactions</Typography>
                            {renderTransactionListItems(blockData.transactionsList, activeTab === 'flashblocks')}
                            <Typography variant="caption" color="text.disabled" sx={{ mt: 2, fontStyle: 'italic' }}>
                                {isFlashBlock ? '~200ms block time' : '~2s block time'}
                            </Typography>
                        </Paper>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        );
    };

    return (
        <ThemeProvider theme={darkTheme} >
            <CssBaseline />
         <Box sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100vw",
         }}>
         <Container  sx={{ pt: 4, pb: 8 ,}}>
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
                                Flashblocks Stream (200ms)
                            </Typography>
                            {formatBlock(latestFlashBlock, true, flashBlockAnimationKey)}
                        </Box>
                    )}

                    {activeTab === 'fullblocks' && (
                        <Box>
                            <Typography variant="h6" align="center" gutterBottom color="secondary">
                                Full Blocks Stream (2s)
                            </Typography>
                            {formatBlock(latestFullBlock, false, fullBlockAnimationKey)}
                        </Box>
                    )}

                    {activeTab === 'comparison' && (
                        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                            <Grid container spacing={4} maxWidth="md" sx={{
                            }}>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="h6" align="center" gutterBottom color="primary">
                                        Latest Flashblock (200ms)
                                    </Typography>
                                    {formatBlock(latestFlashBlock, true, flashBlockAnimationKey)}
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Typography variant="h6" align="center" gutterBottom color="secondary">
                                        Latest Full Block (2s)
                                    </Typography>
                                    {formatBlock(latestFullBlock, false, fullBlockAnimationKey)}
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </Box>


                <Box mt={10} textAlign="center" color="text.disabled" fontSize="small">
                    © {new Date().getFullYear()} Flashblocks Explorer. Built by Murat Can Yüksel for Base.
                </Box>
            </Container>
         </Box>
        </ThemeProvider>
    );
};

export default FlashblocksApp;
