import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function createCladdingGeometry(width: number, height: number, isVertical: boolean) {
    const boards: THREE.BufferGeometry[] = [];
    const boardWidth = 0.14; 
    const shadowGap = 0.01; 
    const thickness = 0.02;

    if (isVertical) {
        const numBoards = Math.ceil(width / (boardWidth + shadowGap));
        const totalW = numBoards * (boardWidth + shadowGap);
        const startX = -(totalW / 2) + (boardWidth / 2);
        for (let i = 0; i < numBoards; i++) {
            const x = startX + i * (boardWidth + shadowGap);
            const board = new THREE.BoxGeometry(boardWidth, height, thickness);
            board.translate(x, 0, 0); 
            boards.push(board);
        }
    } else {
        const numBoards = Math.ceil(height / (boardWidth + shadowGap));
        const totalH = numBoards * (boardWidth + shadowGap);
        const startY = -(totalH / 2) + (boardWidth / 2);
        for (let i = 0; i < numBoards; i++) {
            const y = startY + i * (boardWidth + shadowGap);
            const board = new THREE.BoxGeometry(width, boardWidth, thickness);
            board.translate(0, y, 0);
            boards.push(board);
        }
    }

    if (boards.length === 0) return new THREE.BoxGeometry(width, height, thickness);
    return mergeGeometries(boards, false);
}

export function createDeckingGeometry(width: number, depth: number) {
    const boards: THREE.BufferGeometry[] = [];
    const boardWidth = 0.145; 
    const gap = 0.005; 
    const thickness = 0.025; 
    const numBoards = Math.ceil(depth / (boardWidth + gap));
    const totalD = numBoards * (boardWidth + gap);
    const startZ = -(totalD / 2) + (boardWidth / 2);

    for (let i = 0; i < numBoards; i++) {
        const z = startZ + i * (boardWidth + gap);
        const board = new THREE.BoxGeometry(width, thickness, boardWidth);
        board.translate(0, 0, z); 
        boards.push(board);
    }
    
    if (boards.length === 0) return new THREE.BoxGeometry(width, thickness, depth);
    return mergeGeometries(boards, false);
}
