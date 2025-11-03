import fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { 
    handleNewConnection, 
    subscriberClient
} from '../shared/redis-client.js';

const WS_PORT = process.env.PORT || 3001;

subscriberClient();

// Initialize Fastify server
const server = fastify();

server.register(cors, { 
    origin: '*',
    methods: ['GET', 'POST']
});

server.register(websocket);

server.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
        try {
            console.log('Client connected to WebSocket.');
            
            // @fastify/websocket v10+ uses { socket } structure
            // Check if connection has socket property, otherwise connection is the socket
            let socket;
            if (connection && connection.socket) {
                socket = connection.socket;
            } else if (connection && typeof connection.send === 'function') {
                socket = connection;
            } else {
                console.error('Invalid WebSocket connection object:', typeof connection);
                return;
            }
            
            // Handle connection before setting up handlers
            handleNewConnection(socket);

            // Send welcome message to confirm connection
            try {
                if (socket && typeof socket.send === 'function') {
                    socket.send(JSON.stringify({ type: 'CONNECTED', message: 'Welcome to Firewall Defense' }));
                }
            } catch (err) {
                console.error('Error sending welcome message:', err);
            }

            if (socket && typeof socket.on === 'function') {
                socket.on('message', (message) => {
                    try {
                        const data = message.toString();
                        // Handle ping messages
                        if (data === '{"type":"ping"}') {
                            socket.send(JSON.stringify({ type: 'pong' }));
                            return;
                        }
                        console.log('Received client message:', data);
                    } catch (err) {
                        console.error('Error handling message:', err);
                    }
                });

                socket.on('error', (error) => {
                    console.error('WebSocket connection error:', error.message || error);
                });

                socket.on('close', (code, reason) => {
                    console.log(`Client disconnected from WebSocket. Code: ${code}, Reason: ${reason || 'none'}`);
                });
            }
        } catch (error) {
            console.error('Error setting up WebSocket connection:', error.message || error);
        }
    });
});

server.post('/notify', async (req, reply) => {
    const notificationPayload = req.body;
    server.log.info('Received notification: %s', notificationPayload.type);
    reply.send({ success: true });
});

const start = async () => {
    try {
        await server.listen({ port: WS_PORT, host: '0.0.0.0' });
        console.log(`WS Service listening on ws://0.0.0.0:${WS_PORT}/ws`);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
