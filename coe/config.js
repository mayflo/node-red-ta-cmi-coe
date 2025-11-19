// CMI Configuration Node (Shared UDP Socket)

module.exports = function(RED) {
    "use strict";
    const dgram = require('dgram');
    const { parseCoEPacket } = require('../lib/coe');

    // CoE Protocol Ports
    const COE_PORT = 5441;
    const COE_PORT_V2 = 5442;

    function CMIConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.address = config.address || '192.168.0.100';
        node.coeVersion = config.coeVersion || 1; // v1, v2
        node.port = (node.coeVersion === 2) ? COE_PORT_V2 : COE_PORT;
        node.localAddress = '0.0.0.0';
        node.socket = null;
        node.listeners = [];

        // UDP Socket erstellen
        try {
            node.socket = dgram.createSocket({
                type: 'udp4',
                reuseAddr: true  // Erlaube Socket Reuse
            });
            
            node.socket.on('message', (msg, rinfo) => {
            
                let data = null;
                data = parseCoEPacket(msg, node.coeVersion === 2 ? 2 : 1);
                
                if (data) {
                    data.sourceIP = rinfo.address;
                    data.version = node.coeVersion;
                    
                    // An alle registrierten Listener weiterleiten
                    node.listeners.forEach(listener => {
                        listener(data);
                    });
                }
            });

            node.socket.on('error', (err) => {
                node.error(`UDP Socket Error: ${err.message}`);
            });

            node.socket.bind(node.port, node.localAddress, () => {
                node.log(`CoE UDP Socket listening on ${node.localAddress}:${node.port} (${node.coeVersion})`);
            });

        } catch(err) {
            node.error(`Failed to create UDP socket: ${err.message}`);
        }

        // Listener registrieren
        node.registerListener = function(callback) {
            node.listeners.push(callback);
        };

        // Listener entfernen
        node.unregisterListener = function(callback) {
            const index = node.listeners.indexOf(callback);
            if (index > -1) {
                node.listeners.splice(index, 1);
            }
        };

        // Daten senden
        node.send = function(host, packet) {
            if (node.socket) {
                node.socket.send(packet, 0, packet.length, node.port, host, (err) => {
                    if (err) {
                        node.error(`Failed to send: ${err.message}`);
                    }
                });
            }
        };

        // Aufräumen beim Beenden
        node.on('close', function() {
            if (node.socket) {
                node.socket.close();
            }
        });
    }
    RED.nodes.registerType("cmi-config", CMIConfigNode);
};