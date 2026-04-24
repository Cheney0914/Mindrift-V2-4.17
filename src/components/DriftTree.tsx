import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Fragment, Connection } from '@/lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2 } from 'lucide-react';
import { clusterThoughts, ClusterResult } from '@/services/geminiService';

interface DriftTreeProps {
  fragments: Fragment[];
  connections: Connection[];
  clusterData?: ClusterResult | null;
  onNodeClick?: (id: string) => void;
  latestId?: string | null;
  title?: string;
  subtitle?: string;
  fragmentsCount?: number;
  driftsCount?: number;
}

const CLUSTER_COLORS = [
  'rgba(255, 78, 0',    // primary orange
  'rgba(120, 80, 255',  // purple
  'rgba(0, 180, 160',   // teal
  'rgba(255, 180, 0',   // amber
  'rgba(220, 60, 120',  // pink
];

interface Particle {
  id: string;
  content: string;
  clusterIndex: number;
  x: number;
  y: number;
  z: number; // 3D coordinate
  baseX: number;
  baseZ: number;
  speedY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  size: number;
  opacity: number;
  isPaused: boolean;
  isFalling: boolean;
  branchPosT: number;
  branchStartX: number;
  branchStartY: number;
  branchStartZ: number;
  branchEndX: number;
  branchEndY: number;
  branchEndZ: number;
  branchCpX: number;
  branchCpY: number;
  branchCpZ: number;
  flashPhase: number;
  flashSpeed: number;
  
  // Interaction state
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  transitionProgress: number;
  isResonating: boolean;
  resonanceStrength: number;
  pulsePhase: number;
  pulseProgress: number;
}

interface Branch {
  theme: string;
  theme_en: string;
  theme_zh?: string;
  startX: number;
  startY: number;
  startZ: number;
  cpX: number;
  cpY: number;
  cpZ: number;
  endX: number;
  endY: number;
  endZ: number;
  color: string;
  intensity: number;
  isSubBranch?: boolean;
  parentId?: number;
}

export const DriftTree: React.FC<DriftTreeProps> = ({ 
  fragments, 
  connections, 
  clusterData,
  onNodeClick, 
  latestId,
  title,
  subtitle,
  fragmentsCount,
  driftsCount
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [resonanceMode, setResonanceMode] = useState<'pulse' | 'expand' | null>(null);
  const [resonanceCenterId, setResonanceCenterId] = useState<string | null>(null);
  const [resonatingCount, setResonatingCount] = useState(0);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const neuralFlowRef = useRef<{ path: string[], currentSegment: number, progress: number }>({ path: [], currentSegment: 0, progress: 0 });
  const journeyPathRef = useRef<{ fragment_ids: string[], progress: number, isGrowing: boolean, growthStartTime: number }>({ fragment_ids: [], progress: 0, isGrowing: false, growthStartTime: 0 });
  const starsRef = useRef<{ x: number, y: number, size: number, opacity: number, speed: number }[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const branchesRef = useRef<Branch[]>([]);
  const animationFrameRef = useRef<number>(0);
  const lastFragmentCountRef = useRef(0);
  const draggedParticleRef = useRef<Particle | null>(null);
  
  // Zoom, Pan & Rotation state
  const transformRef = useRef({ x: 0, y: 0, scale: 1, rotationY: 0, rotationZ: 0 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const growthProgressRef = useRef(0);

  // Multi-touch state
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTouchMidRef = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    growthProgressRef.current = 0;
  }, []);

  const isClustering = !clusterData && fragments.length >= 3;

  // Auto-transition to expand mode after 5s
  useEffect(() => {
    if (resonanceMode === 'pulse' && resonanceCenterId) {
      pulseTimeoutRef.current = setTimeout(() => {
        const centerP = particlesRef.current.find(p => p.id === resonanceCenterId);
        if (centerP) {
          setResonanceMode('expand');
          setupExpansion(centerP);
        }
      }, 5000); // Changed to 5 seconds
    }
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [resonanceMode, resonanceCenterId]);

  // Initialize branches and particles when clusterData or fragments change
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const trunkTopX = width / 2;
    const trunkTopY = height * 0.65;
    const trunkBottomX = width / 2;
    if (clusterData && clusterData.clusters.length > 0) {
      // Initialize stars if needed
      if (starsRef.current.length === 0) {
        starsRef.current = Array.from({ length: 150 }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2,
          opacity: Math.random(),
          speed: 0.2 + Math.random() * 0.5
        }));
      }

      const clusters = clusterData.clusters;
      const maxCount = Math.max(...clusters.map(c => c.fragment_ids.length));

      const newBranches: Branch[] = [];
      clusters.forEach((c, i) => {
        const angle = (Math.PI * 2 / clusters.length) * i;
        const length = Math.min(width, height) * 0.45; // Reduced from 0.6
        
        const endX = Math.cos(angle) * length * 1.15; // Reduced from 1.3
        const endZ = Math.sin(angle) * length * 1.15;
        const endY = -length * 0.75; 
        
        const cpX = Math.cos(angle) * (length * 0.7); // Reduced from 0.8
        const cpZ = Math.sin(angle) * (length * 0.7);
        const cpY = -length * -0.15; // Reverted closer to original -0.2

        const intensity = c.fragment_ids.length / (maxCount || 1);
        // Orange palette for branches: rgba(255, 80-160, 0)
        const greenValue = 80 + (80 * intensity);
        const color = `rgba(255, ${greenValue}, 0`; 

        const mainBranchIdx = newBranches.length;
        newBranches.push({
          theme: c.theme,
          theme_en: c.theme_en,
          theme_zh: c.theme_zh,
          startX: 0,
          startY: 0,
          startZ: 0,
          cpX,
          cpY,
          cpZ,
          endX,
          endY,
          endZ,
          color,
          intensity
        });

        // Use sub-themes from AI instead of generic ones
        const subThemes = c.sub_themes || [];
        subThemes.forEach((st: any, j) => {
          const t = 0.4 + (j / subThemes.length) * 0.4;
          const sx = Math.pow(1 - t, 2) * 0 + 2 * (1 - t) * t * cpX + Math.pow(t, 2) * endX;
          const sy = Math.pow(1 - t, 2) * 0 + 2 * (1 - t) * t * cpY + Math.pow(t, 2) * endY;
          const sz = Math.pow(1 - t, 2) * 0 + 2 * (1 - t) * t * cpZ + Math.pow(t, 2) * endZ;

          const subAngle = angle + (Math.random() - 0.5) * 1.5;
          const subLen = length * 0.4; // Increased from 0.3
          const ex = sx + Math.cos(subAngle) * subLen;
          const ez = sz + Math.sin(subAngle) * subLen;
          const ey = sy - subLen * 0.5;

          newBranches.push({
            theme: st.label,
            theme_en: st.label_en,
            theme_zh: st.label_zh,
            startX: sx,
            startY: sy,
            startZ: sz,
            cpX: sx + (ex - sx) * 0.5,
            cpY: sy + (ey - sy) * 0.5 - 20,
            cpZ: sz + (ez - sz) * 0.5,
            endX: ex,
            endY: ey,
            endZ: ez,
            color,
            intensity,
            isSubBranch: true,
            parentId: mainBranchIdx
          });
        });
      });
      branchesRef.current = newBranches;

      // Create particles
      const newParticles: Particle[] = [];
      const connectedIds = new Set([
        ...connections.map(c => c.fragment_a_id),
        ...connections.map(c => c.fragment_b_id)
      ]);

      fragments.forEach(f => {
        const clusterIdx = clusters.findIndex(c => c.fragment_ids.includes(f.id));
        const clusterIndex = clusterIdx === -1 ? 0 : clusterIdx;
        const mainBranch = newBranches.find(mb => !mb.isSubBranch && 
          clusters.findIndex(cl => cl.theme === mb.theme) === clusterIndex
        );
        const mainIdx = newBranches.indexOf(mainBranch!);
        
        const clusterBranches = newBranches.filter((b, idx) => {
          return idx === mainIdx || (b.isSubBranch && b.parentId === mainIdx);
        });
        
        const branch = clusterBranches[Math.floor(Math.random() * clusterBranches.length)] || newBranches[0];
        const isConnected = connectedIds.has(f.id);
        const t = branch.isSubBranch ? (0.2 + Math.random() * 0.8) : (0.3 + Math.random() * 0.6);
        
        const px = Math.pow(1 - t, 2) * branch.startX + 2 * (1 - t) * t * branch.cpX + Math.pow(t, 2) * branch.endX;
        const py = Math.pow(1 - t, 2) * branch.startY + 2 * (1 - t) * t * branch.cpY + Math.pow(t, 2) * branch.endY;
        const pz = Math.pow(1 - t, 2) * branch.startZ + 2 * (1 - t) * t * branch.cpZ + Math.pow(t, 2) * branch.endZ;

        const offsetRange = 30 + Math.random() * 40; // Reduced cluster spread for better resolution
        const ox = (Math.random() - 0.5) * offsetRange;
        const oy = (Math.random() - 0.5) * offsetRange;
        const oz = (Math.random() - 0.5) * offsetRange;

        newParticles.push({
          id: f.id,
          content: f.content,
          clusterIndex,
          x: px + ox,
          y: py + oy,
          z: pz + oz,
          baseX: px + ox,
          baseZ: pz + oz,
          speedY: 0.03 + Math.random() * 0.06,
          amplitude: 15 + Math.random() * 25,
          frequency: 0.001 + Math.random() * 0.003,
          phase: Math.random() * Math.PI * 2,
          size: 5 + Math.random() * 3,
          opacity: 0.7 + Math.random() * 0.3,
          isPaused: false,
          isFalling: false, // Force stay on tree as per user request
          branchPosT: t,
          branchStartX: branch.startX,
          branchStartY: branch.startY,
          branchStartZ: branch.startZ,
          branchEndX: branch.endX,
          branchEndY: branch.endY,
          branchEndZ: branch.endZ,
          branchCpX: branch.cpX,
          branchCpY: branch.cpY,
          branchCpZ: branch.cpZ,
          flashPhase: Math.random() * Math.PI * 2,
          flashSpeed: 0.02 + Math.random() * 0.03,
          transitionProgress: 1,
          isResonating: false,
          resonanceStrength: 0,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseProgress: 1
        });
      });
      particlesRef.current = newParticles;
      // Skip roots/trunk growth (0-0.3) if we already have some progress from naive tree
      if (growthProgressRef.current > 0.3) {
        growthProgressRef.current = 0.3;
      } else {
        growthProgressRef.current = 0;
      }
    } else if (fragments.length > 0) {
      // NAIVE TREE (Immediate growth while AI works)
      const naiveClusterCount = 3;
      const newBranches: Branch[] = [];
      const colors = ['rgba(255, 100, 0', 'rgba(255, 125, 0', 'rgba(255, 150, 0'];
      const themes = ['Drift', 'Flow', 'Echo'];
      
      for (let i = 0; i < naiveClusterCount; i++) {
        const angle = (Math.PI * 2 / naiveClusterCount) * i;
        const length = Math.min(width, height) * 0.35; // Reduced from 0.45
        const endX = Math.cos(angle) * length * 1.15; // Reduced from 1.3
        const endZ = Math.sin(angle) * length * 1.15;
        const endY = -length * 0.65;
        const cpX = Math.cos(angle) * (length * 0.55); // Reduced from 0.7
        const cpZ = Math.sin(angle) * (length * 0.7);
        const cpY = -length * 0.1;

        newBranches.push({
          theme: themes[i],
          theme_en: themes[i],
          startX: 0,
          startY: 0,
          startZ: 0,
          cpX,
          cpY,
          cpZ,
          endX,
          endY,
          endZ,
          color: colors[i % colors.length],
          intensity: 0.5
        });
      }
      branchesRef.current = newBranches;

      const newParticles: Particle[] = [];
      fragments.forEach((f, idx) => {
        const branchIdx = idx % naiveClusterCount;
        const branch = newBranches[branchIdx];
        const t = 0.3 + Math.random() * 0.6;
        
        const px = Math.pow(1 - t, 2) * branch.startX + 2 * (1 - t) * t * branch.cpX + Math.pow(t, 2) * branch.endX;
        const py = Math.pow(1 - t, 2) * branch.startY + 2 * (1 - t) * t * branch.cpY + Math.pow(t, 2) * branch.endY;
        const pz = Math.pow(1 - t, 2) * branch.startZ + 2 * (1 - t) * t * branch.cpZ + Math.pow(t, 2) * branch.endZ;

        newParticles.push({
          id: f.id, content: f.content, clusterIndex: branchIdx,
          x: px, y: py, z: pz, baseX: px, baseZ: pz,
          speedY: 0.1, amplitude: 10, frequency: 0.002, phase: 0, size: 5, opacity: 0.8,
          isPaused: false, 
          isFalling: false, 
          branchPosT: t,
          branchStartX: branch.startX, branchStartY: branch.startY, branchStartZ: branch.startZ,
          branchEndX: branch.endX, branchEndY: branch.endY, branchEndZ: branch.endZ,
          branchCpX: branch.cpX, branchCpY: branch.cpY, branchCpZ: branch.cpZ,
          flashPhase: 0, flashSpeed: 0.02,
          transitionProgress: 1,
          isResonating: false,
          resonanceStrength: 0,
          pulsePhase: 0,
          pulseProgress: 1
        });
      });
      particlesRef.current = newParticles;
      // Note: We don't reset growthProgress here if it's already running
      if (growthProgressRef.current === 0) growthProgressRef.current = 0.01;
    }
  }, [clusterData, fragments, latestId]);

  // Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === containerRef.current) {
          canvas.width = entry.contentRect.width;
          canvas.height = entry.contentRect.height;
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    const animate = () => {
      try {
        const width = canvas.width;
        const height = canvas.height;
        
        if (width === 0 || height === 0) {
          animationFrameRef.current = requestAnimationFrame(animate);
          return;
        }

        // Update Growth
        if (growthProgressRef.current < 1) {
          growthProgressRef.current += 0.008; // Faster growth
        }

        const time = Date.now() * 0.001;
        ctx.clearRect(0, 0, width, height);

      // 1. Background (Fixed)
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, '#080810');
      bgGradient.addColorStop(1, '#0a0a1a');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Neural Horizon Line (Subtle blurred glow at the roots base)
      const horizonY = height * 0.75;
      
      // Draw Stars (twinkling and drifting)
      starsRef.current.forEach(star => {
        star.y += star.speed * 0.2;
        star.x += Math.sin(time + star.speed) * 0.1;
        if (star.y > height) star.y = 0;
        if (star.x > width) star.x = 0;
        if (star.x < 0) star.x = width;
        
        const twinkle = 0.5 + Math.sin(time * star.speed * 2) * 0.5;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * (0.8 + twinkle * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle * 0.6})`;
        ctx.fill();
      });

      // Draw horizon glow over background but under tree
      const horizonGrd = ctx.createLinearGradient(0, horizonY - 150, 0, horizonY + 50);
      horizonGrd.addColorStop(0, 'transparent');
      horizonGrd.addColorStop(0.5, 'rgba(255, 78, 0, 0.05)');
      horizonGrd.addColorStop(1, 'transparent');
      ctx.fillStyle = horizonGrd;
      ctx.fillRect(0, horizonY - 150, width, 200);

      ctx.save();
      
      // Horizon point as the center of rotation
      const trunkHeight = height * 0.1 * Math.min(1, growthProgressRef.current / 0.3);
      // horizonY already defined
      
      ctx.translate(width / 2 + transformRef.current.x, horizonY + transformRef.current.y);
      ctx.scale(transformRef.current.scale, transformRef.current.scale);

      const rotY = transformRef.current.rotationY;
      const rotZ = transformRef.current.rotationZ;

      // Projection function with Y and Z rotation
      const project = (x: number, y: number, z: number) => {
        // Y rotation
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        let rx = x * cosY - z * sinY;
        let rz = x * sinY + z * cosY;
        
        // Z rotation
        const cosZ = Math.cos(rotZ);
        const sinZ = Math.sin(rotZ);
        const finalX = rx * cosZ - y * sinZ;
        const finalY = rx * sinZ + y * cosZ;
        
        return { x: finalX, y: finalY, z: rz };
      };

      // 2. Draw Roots & Trunk (Neural/Fibrous Style)
      // Trunk now goes from (0, 0, 0) to (0, -trunkHeight, 0)
      if (trunkHeight > 0) {
        // Roots spreading out from the base (0, 0, 0)
        const rootProgress = Math.min(1, growthProgressRef.current / 0.2);
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 24; i++) {
          const angle = (Math.PI * 2 / 24) * i;
          const r = 150 * rootProgress;
          const noise = Math.sin(i * 10 + Date.now() * 0.001) * 10;
          
          ctx.beginPath();
          const start = project(0, 0, 0);
          const cp = project(Math.cos(angle) * r * 0.5, 30 + noise, Math.sin(angle) * r * 0.5);
          const end = project(Math.cos(angle) * r, 50, Math.sin(angle) * r);
          
          ctx.strokeStyle = 'rgba(255, 78, 0, 0.1)';
          ctx.moveTo(start.x, start.y);
          ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
          ctx.stroke();
          
          // Small root nodes
          if (rootProgress > 0.8) {
            ctx.beginPath();
            ctx.arc(end.x, end.y, 1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 78, 0, 0.3)';
            ctx.fill();
          }
        }

        // Fibrous Trunk
        for (let i = 0; i < 20; i++) {
          const angle = (Math.PI * 2 / 20) * i;
          const radius = 15 * (1 - (growthProgressRef.current * 0.2));
          const sx = Math.cos(angle) * radius;
          const sz = Math.sin(angle) * radius;
          
          const sway = Math.sin(Date.now() * 0.0005 + i) * 5;
          
          ctx.beginPath();
          const start = project(sx, 0, sz);
          const cp = project(sx + sway, -trunkHeight * 0.5, sz + sway);
          const end = project(0, -trunkHeight, 0);
          
          ctx.strokeStyle = `rgba(255, 78, 0, ${0.1 + Math.random() * 0.15})`;
          ctx.lineWidth = 1;
          ctx.moveTo(start.x, start.y);
          ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
          ctx.stroke();
          
          // Glowing fibers
          if (Math.random() > 0.98) {
            const isMobile = window.innerWidth < 768;
            if (!isMobile) {
              ctx.shadowBlur = 10;
              ctx.shadowColor = 'rgba(255, 78, 0, 0.8)';
            }
            ctx.strokeStyle = 'rgba(255, 150, 0, 0.4)';
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 3. Draw Branches (Growth 0.3 - 0.7)
      // Branches start from (0, -trunkHeight, 0)
      const branchProgress = Math.max(0, Math.min(1, (growthProgressRef.current - 0.3) / 0.4));
      if (branchProgress > 0) {
        branchesRef.current.forEach(branch => {
          ctx.beginPath();
          const start = project(branch.startX, branch.startY - trunkHeight, branch.startZ);
          const cp = project(branch.cpX, branch.cpY - trunkHeight, branch.cpZ);
          const end = project(branch.endX, branch.endY - trunkHeight, branch.endZ);

          ctx.moveTo(start.x, start.y);
          
          // Partial Bezier for growth
          const t = branchProgress;
          const qx = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cp.x + t * t * end.x;
          const qy = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cp.y + t * t * end.y;

          // We use a simpler quadratic approximation for the partial curve
          const midCpX = (1 - t) * start.x + t * cp.x;
          const midCpY = (1 - t) * start.y + t * cp.y;
          ctx.quadraticCurveTo(midCpX, midCpY, qx, qy);

          ctx.strokeStyle = `${branch.color}, 0.3)`;
          ctx.lineWidth = 3 * (1 - branchProgress * 0.5);
          
          // Glow effect for branches - reduced on mobile
          const isMobile = window.innerWidth < 768;
          if (!isMobile) {
            ctx.shadowBlur = 8 * branchProgress;
            ctx.shadowColor = `${branch.color}, 0.5)`;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;

          if (branchProgress === 1) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = branch.isSubBranch ? 'italic 10px serif' : 'bold italic 13px serif';
            ctx.textAlign = 'center';
            const label = branch.theme_zh && branch.theme_en 
              ? `${branch.theme_zh}\n${branch.theme_en}`
              : branch.theme_en || branch.theme;
            
            // Handle multi-line drawing for dual language
            if (label.includes('\n')) {
              const lines = label.split('\n');
              ctx.fillText(lines[0], end.x, end.y - 18);
              ctx.font = branch.isSubBranch ? 'italic 8px serif' : 'italic 10px serif';
              ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
              ctx.fillText(lines[1], end.x, end.y - 6);
            } else {
              ctx.fillText(label, end.x, end.y - 12);
            }
          }
        });
      }

      // 4. Update and Draw Particles (Growth 0.7 - 1.0)
      const nodeProgress = Math.max(0, Math.min(1, (growthProgressRef.current - 0.7) / 0.3));
      if (nodeProgress > 0) {
        // --- Draw Thought Path (Evolutionary Trace) ---
        if (clusterData?.thought_path?.fragment_ids && clusterData.thought_path.fragment_ids.length > 1) {
          const pathIds = clusterData.thought_path.fragment_ids;
          
          // Determine if we should show/grow the path
          const journey = journeyPathRef.current;
          let shouldDraw = false;
          let currentGrowth = 1;

          if (journey.isGrowing) {
            const elapsed = Date.now() - journey.growthStartTime;
            const growthDuration = 3000; // 3 seconds to complete the whole path
            currentGrowth = Math.min(1, elapsed / growthDuration);
            shouldDraw = true;
          } else if (selectedNode === null && !resonanceMode) {
             // If nothing is active, show the full path statically but slightly dimmed
             shouldDraw = true;
             currentGrowth = 1;
          }

          if (shouldDraw) {
            ctx.save();
            
            // Draw segments based on growth
            const totalSegments = pathIds.length - 1;
            const activeSegmentsCount = currentGrowth * totalSegments;

            ctx.beginPath();
            let first = true;
            for (let i = 0; i <= Math.ceil(activeSegmentsCount); i++) {
              if (i >= pathIds.length) break;
              const id = pathIds[i];
              if (!id) continue;
              const p = particlesRef.current.find(part => part.id === id);
              if (p) {
                const pos = project(p.x, p.y - trunkHeight, p.z);
                if (!pos || isNaN(pos.x) || isNaN(pos.y)) continue;
                
                // If it's a partial segment, interpolate
                if (i > activeSegmentsCount && i > 0) {
                  const lastId = pathIds[i-1];
                  const lastP = lastId ? particlesRef.current.find(part => part.id === lastId) : null;
                  if (lastP) {
                    const lastPos = project(lastP.x, lastP.y - trunkHeight, lastP.z);
                    const t = activeSegmentsCount - (i - 1);
                    const fx = lastPos.x + (pos.x - lastPos.x) * t;
                    const fy = lastPos.y + (pos.y - lastPos.y) * t;
                    ctx.lineTo(fx, fy);
                  }
                } else {
                  if (first) {
                    ctx.moveTo(pos.x, pos.y);
                    first = false;
                  } else {
                    ctx.lineTo(pos.x, pos.y);
                  }
                }
              }
            }

            // Style for the "Journey" line
            ctx.strokeStyle = `rgba(255, 255, 255, ${journey.isGrowing ? 0.4 : 0.15})`;
            ctx.setLineDash([5, 15]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Flowing light along the path (only drawn if fully grown or enough revealed)
            if (activeSegmentsCount > 0.1) {
              journey.progress += 0.005;
              if (journey.progress > 1) journey.progress = 0;
              
              const prog = journey.progress * currentGrowth; // Scale flow with growth
              const totalPoints = pathIds.length;
              if (totalPoints > 1) {
                const segmentIdx = Math.floor(prog * (totalPoints - 1));
                const segmentProgress = (prog * (totalPoints - 1)) % 1;
                
                const p1 = particlesRef.current.find(part => part.id === pathIds[segmentIdx]);
                const p2 = particlesRef.current.find(part => part.id === pathIds[segmentIdx + 1]);
                
                if (p1 && p2) {
                  const pos1 = project(p1.x, p1.y - trunkHeight, p1.z);
                  const pos2 = project(p2.x, p2.y - trunkHeight, p2.z);
                  
                  const fx = pos1.x + (pos2.x - pos1.x) * segmentProgress;
                  const fy = pos1.y + (pos2.y - pos1.y) * segmentProgress;
                  
                  // Expanding pulse at current focus point
                  ctx.beginPath();
                  ctx.arc(fx, fy, 4, 0, Math.PI * 2);
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                  ctx.shadowBlur = 15;
                  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                  ctx.fill();
                  ctx.shadowBlur = 0;
                }
              }

              // Label A, B, C for the path
              for (let i = 0; i < pathIds.length; i++) {
                if (i > activeSegmentsCount) break;
                const lp = particlesRef.current.find(part => part.id === pathIds[i]);
                if (lp) {
                  const lPos = project(lp.x, lp.y - trunkHeight, lp.z);
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                  ctx.font = 'bold 10px sans-serif';
                  ctx.fillText(String.fromCharCode(65 + i), lPos.x, lPos.y - 15);
                }
              }
            }
            ctx.restore();
          }
        }

        // First update all particle positions
        particlesRef.current.forEach(p => {
          // Position interpolation for Expand mode
          if (p.transitionProgress < 1) {
            p.transitionProgress += 0.025; // roughly 600ms at 60fps (1/0.025 = 40 frames)
            if (p.transitionProgress > 1) p.transitionProgress = 1;
            
            if (p.targetX !== undefined && p.targetY !== undefined && p.targetZ !== undefined) {
              // Simple ease-out: 1 - (1-t)^2
              const t = 1 - Math.pow(1 - p.transitionProgress, 2);
              p.x = p.x + (p.targetX - p.x) * t * 0.1; // Iterative approach for smooth transition
              p.y = p.y + (p.targetY - p.y) * t * 0.1;
              p.z = p.z + (p.targetZ - p.z) * t * 0.1;
              
              // If very close, snap
              if (p.transitionProgress > 0.95) {
                p.x = p.targetX;
                p.y = p.targetY;
                p.z = p.targetZ;
              }
            }
          }

          if (!p.isPaused) {
            p.flashPhase += p.flashSpeed;
            if (p.isFalling) {
              p.y += p.speedY * 0.5; // Slow down falling
              p.phase += p.frequency;
              p.x = p.baseX + Math.sin(p.phase) * p.amplitude * 0.5;
              p.z = p.baseZ + Math.cos(p.phase) * p.amplitude * 0.5;

              if (p.y > height * 0.5) { // Reset relative to junction
                const t = p.branchPosT;
                p.x = Math.pow(1 - t, 2) * p.branchStartX + 2 * (1 - t) * t * p.branchCpX + Math.pow(t, 2) * p.branchEndX;
                p.y = Math.pow(1 - t, 2) * p.branchStartY + 2 * (1 - t) * t * p.branchCpY + Math.pow(t, 2) * p.branchEndY;
                p.z = Math.pow(1 - t, 2) * p.branchStartZ + 2 * (1 - t) * t * p.branchCpZ + Math.pow(t, 2) * p.branchEndZ;
                p.baseX = p.x;
                p.baseZ = p.z;
              }
            } else {
              // Floating effect
              p.phase += p.frequency;
              const t = p.branchPosT;
              const bx = Math.pow(1 - t, 2) * p.branchStartX + 2 * (1 - t) * t * p.branchCpX + Math.pow(t, 2) * p.branchEndX;
              const by = Math.pow(1 - t, 2) * p.branchStartY + 2 * (1 - t) * t * p.branchCpY + Math.pow(t, 2) * p.branchEndY;
              const bz = Math.pow(1 - t, 2) * p.branchStartZ + 2 * (1 - t) * t * p.branchCpZ + Math.pow(t, 2) * p.branchEndZ;
              
              // Smoothly return to branch position if expansion was active
              const targetX = (resonanceMode === 'expand' && p.isResonating) ? p.targetX! : bx;
              const targetY = (resonanceMode === 'expand' && p.isResonating) ? p.targetY! : by;
              const targetZ = (resonanceMode === 'expand' && p.isResonating) ? p.targetZ! : bz;

              const floatX = Math.sin(p.phase) * 4;
              const floatY = Math.cos(p.phase * 0.8) * 4;
              const floatZ = Math.sin(p.phase * 1.2) * 4;

              if (resonanceMode === 'expand' && p.isResonating) {
                // No float while expanded to keep it precise
                p.x = p.x + (targetX - p.x) * 0.1;
                p.y = p.y + (targetY - p.y) * 0.1;
                p.z = p.z + (targetZ - p.z) * 0.1;
              } else {
                // Blend float with base position return
                p.x = p.x + (targetX + floatX - p.x) * 0.1;
                p.y = p.y + (targetY + floatY - p.y) * 0.1;
                p.z = p.z + (targetZ + floatZ - p.z) * 0.1;
              }
            }
          }
        });

        // 5. Draw Inter-node Connections & Expansion Lines
        if (nodeProgress === 1) {
          const activeCenterId = resonanceCenterId || selectedNode?.id;
          if (resonanceMode === 'expand' && activeCenterId) {
            const centerP = particlesRef.current.find(p => p.id === activeCenterId);
            if (centerP) {
              const posCenter = project(centerP.x, centerP.y - trunkHeight, centerP.z);
              
              particlesRef.current.forEach(p => {
                if (p.isResonating && p.id !== activeCenterId) {
                  const posTarget = project(p.x, p.y - trunkHeight, p.z);
                  
                  // Draw Connection line
                  ctx.lineWidth = 1;
                  ctx.setLineDash([]);
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                  ctx.beginPath();
                  ctx.moveTo(posCenter.x, posCenter.y);
                  ctx.lineTo(posTarget.x, posTarget.y);
                  ctx.stroke();
 
                  // Find connection reasoning for label
                  const conn = connections.find(c => 
                    (c.fragment_a_id === activeCenterId && c.fragment_b_id === p.id) ||
                    (c.fragment_b_id === activeCenterId && c.fragment_a_id === p.id)
                  );
                  
                  if (conn?.reasoning) {
                    const midX = (posCenter.x + posTarget.x) / 2;
                    const midY = (posCenter.y + posTarget.y) / 2;
                    // Improved keyword extraction: take a meaningful word
                    const words = conn.reasoning.split(/\s+/).filter(w => w.length > 3);
                    const keyword = (words[0] || conn.reasoning.split(/\s+/)[0] || '').substring(0, 4);
                    
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.font = '9px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(keyword, midX, midY);
                  }

                  // Draw Node label (first 5 chars)
                  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                  ctx.font = 'italic 9px serif';
                  ctx.textAlign = 'center';
                  ctx.fillText(p.content.substring(0, 5) + (p.content.length > 5 ? '..' : ''), posTarget.x, posTarget.y + 12);
                }
              });

              // --- Pulse Flow (Neural Path Animation) ---
              const flow = neuralFlowRef.current;
              if (flow.path.length > 1) {
                flow.progress += 0.006; // Slowed down from 0.012
                if (flow.progress >= 1) {
                  flow.progress = 0;
                  flow.currentSegment = (flow.currentSegment + 1) % (flow.path.length - 1);
                }

                const startId = flow.path[flow.currentSegment];
                const endId = flow.path[flow.currentSegment + 1];
                const pStart = particlesRef.current.find(p => p.id === startId);
                const pEnd = particlesRef.current.find(p => p.id === endId);

                if (pStart && pEnd) {
                  const sPos = project(pStart.x, pStart.y - trunkHeight, pStart.z);
                  const ePos = project(pEnd.x, pEnd.y - trunkHeight, pEnd.z);
                  
                  const fx = sPos.x + (ePos.x - sPos.x) * flow.progress;
                  const fy = sPos.y + (ePos.y - sPos.y) * flow.progress;

                  // Draw Spark
                  ctx.beginPath();
                  ctx.arc(fx, fy, 2, 0, Math.PI * 2);
                  ctx.fillStyle = '#fff';
                  ctx.shadowBlur = 10;
                  ctx.shadowColor = '#fff';
                  ctx.fill();
                  ctx.shadowBlur = 0;
                  
                  // Pulse trail
                  ctx.beginPath();
                  ctx.moveTo(sPos.x + (ePos.x - sPos.x) * Math.max(0, flow.progress - 0.2), sPos.y + (ePos.y - sPos.y) * Math.max(0, flow.progress - 0.2));
                  ctx.lineTo(fx, fy);
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                  ctx.lineWidth = 1;
                  ctx.stroke();
                }
              }
            }
          } else {
            // Standard Connections
            ctx.lineWidth = 0.5;
            ctx.setLineDash([3, 3]);
            connections.forEach(conn => {
              const p1 = particlesRef.current.find(p => p.id === conn.fragment_a_id);
              const p2 = particlesRef.current.find(p => p.id === conn.fragment_b_id);
              
              if (p1 && p2) {
                // Dim unrelated connections
                const opacity = resonanceMode ? 0.05 : 0.15;
                const pos1 = project(p1.x, p1.y - trunkHeight, p1.z);
                const pos2 = project(p2.x, p2.y - trunkHeight, p2.z);
                
                const branch = branchesRef.current[p1.clusterIndex];
                const color = branch?.color || 'rgba(255, 78, 0';

                ctx.beginPath();
                ctx.moveTo(pos1.x, pos1.y);
                ctx.lineTo(pos2.x, pos2.y);
                ctx.strokeStyle = `${color}, ${opacity})`;
                ctx.stroke();
              }
            });
            ctx.setLineDash([]);
          }
        }

        // 6. Draw Particles and Pulses
        particlesRef.current.forEach(p => {
          const isSelected = (selectedNode?.id === p.id) || (resonanceCenterId === p.id);
          const pos = project(p.x, p.y - trunkHeight, p.z);
          const flash = (Math.sin(p.flashPhase) + 1) / 2;
          
          const branch = branchesRef.current[p.clusterIndex];
          const clusterColor = branch?.color || 'rgba(255, 78, 0';
          
          // Determine static node color and size based on relationship
          let nodeColor = clusterColor;
          let nodeSizeMult = 1;
          let glowIntensity = 0.4 + flash * 0.4;
          let shadowBlur = (5 + flash * 10);

          if (selectedNode || resonanceCenterId) {
            if (isSelected) {
              nodeSizeMult = 1.8;
              glowIntensity = 1; // Solid glow for selected
              shadowBlur = 20;
              nodeColor = 'rgba(255, 255, 255'; // Highlight selected with white/bright glow
            } else if (p.isResonating) {
              // High correlation (strength > 0.6) uses theme color, others use gray
              if (p.resonanceStrength > 0.6) {
                nodeSizeMult = 1.3;
                nodeColor = clusterColor;
              } else {
                nodeSizeMult = 0.9;
                nodeColor = 'rgba(100, 100, 110'; // Static gray for low correlation
              }
            }
          }

          // Pulse Drawing (One-time pulse for associated nodes)
          if (p.pulseProgress < 1) {
            p.pulseProgress += 0.02; // Roughly 50 frames (around 0.8s)
            
            const ringPhase = p.pulseProgress;
            const radius = (p.size / 2) + ringPhase * 50;
            const alpha = (1 - ringPhase) * 0.6;
            
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? `rgba(255, 255, 255, ${alpha})` : `${nodeColor}, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }

          // Node styling
          const baseOpacity = 0.8; // standard visibility
          let targetOpacity = baseOpacity;

          if (resonanceMode) {
            targetOpacity = (isSelected || p.isResonating) ? 1 : 0.15;
          } else if (selectedNode) {
            targetOpacity = isSelected ? 1 : 0.4;
          }

          p.opacity = p.opacity + (targetOpacity - p.opacity) * 0.1;
          
          ctx.shadowBlur = shadowBlur * nodeSizeMult;
          ctx.shadowColor = `${nodeColor}, ${glowIntensity})`;
          
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, (p.size / 2) * nodeProgress * nodeSizeMult, 0, Math.PI * 2);
          ctx.fillStyle = `${nodeColor}, ${p.opacity * nodeProgress * (0.6 + flash * 0.4)})`;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Check hovering for expand mode content update
          if (resonanceMode === 'expand' && p.isResonating) {
            const m = lastMousePosRef.current;
            const canvas = canvasRef.current;
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const mx = m.x - rect.left;
              const my = m.y - rect.top;
              const dist = Math.sqrt((pos.x + width / 2 + transformRef.current.x - mx) ** 2 + (pos.y + horizonY + transformRef.current.y - my) ** 2);
              if (dist < 20) {
                setHoveredNodeId(p.id);
              }
            }
          }
        });
      }

      ctx.restore();
      animationFrameRef.current = requestAnimationFrame(animate);
    } catch (err) {
      console.error("DriftTree Render Error:", err);
      // Attempt to restart frame even on error to keep UI interactive
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  };

  animate();

  return () => {
    resizeObserver.disconnect();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };
}, [clusterData]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = canvas.width;
    const height = canvas.height;
    const horizonY = height * 0.75;
    
    // Convert mouse to world coordinates relative to neural base
    const mouseX = (e.clientX - rect.left - (width / 2 + transformRef.current.x)) / transformRef.current.scale;
    const mouseY = (e.clientY - rect.top - (horizonY + transformRef.current.y)) / transformRef.current.scale;

    const rotY = transformRef.current.rotationY;
    const rotZ = transformRef.current.rotationZ;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);

    const trunkHeight = height * 0.1 * Math.min(1, growthProgressRef.current / 0.3);

    // 1. Check for particle hit
    let clickedParticle = null;
    let minProjectedDist = Infinity;

    for (const p of particlesRef.current) {
      let rx = p.x * cosY - p.z * sinY;
      let rz = p.x * sinY + p.z * cosY;
      const ry = p.y - trunkHeight;
      const projX = rx * cosZ - ry * sinZ;
      const projY = rx * sinZ + ry * cosZ;
      
      const dist = Math.sqrt((projX - mouseX) ** 2 + (projY - mouseY) ** 2);
      if (dist < 15 / transformRef.current.scale && dist < minProjectedDist) {
        minProjectedDist = dist;
        clickedParticle = p;
      }
    }

    if (clickedParticle) {
      // CLEAR old resonance when picking a new one to view
      setResonanceMode(null);
      setResonanceCenterId(null);
      particlesRef.current.forEach(p => {
        p.isResonating = false;
        p.pulseProgress = 1;
      });

      // LAYER 1: Select node (Open drawer)
      setSelectedNode({
        type: 'fragment',
        content: clickedParticle.content,
        id: clickedParticle.id,
        clusterTheme: clusterData?.clusters[clickedParticle.clusterIndex]?.theme
      });
      setHoveredNodeId(null);
    } else {
      // CLICK BLANK
      isDraggingRef.current = true;
      setResonanceMode(null);
      setResonanceCenterId(null);
      setSelectedNode(null);
      setHoveredNodeId(null);
      particlesRef.current.forEach(p => {
        p.isPaused = false;
        p.isResonating = false;
        p.pulseProgress = 1;
        p.targetX = undefined;
        p.targetY = undefined;
        p.targetZ = undefined;
      });
    }
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePulseStart = (clickedParticle: Particle) => {
    // Reset old resonance states
    particlesRef.current.forEach(p => {
      p.isPaused = false;
      p.isResonating = false;
      p.transitionProgress = 1;
      p.targetX = undefined;
      p.targetY = undefined;
      p.targetZ = undefined;
    });
 
    clickedParticle.isPaused = true;
    setResonanceCenterId(clickedParticle.id);
    setResonanceMode('pulse');
    
    const related = connections.filter(c => 
      c.fragment_a_id === clickedParticle.id || c.fragment_b_id === clickedParticle.id
    );
    
    setResonatingCount(related.length);
    
    particlesRef.current.forEach(p => {
      const conn = related.find(c => c.fragment_a_id === p.id || c.fragment_b_id === p.id);
      if (p.id === clickedParticle.id) {
        p.isResonating = true;
        p.resonanceStrength = 1;
        p.pulseProgress = 0; // Trigger once
      } else if (conn) {
        p.isResonating = true;
        p.resonanceStrength = conn.strength || 0.5;
        p.pulsePhase = Math.random() * Math.PI * 2;
        p.pulseProgress = 0; // Trigger once
      } else {
        p.isResonating = false;
        p.pulseProgress = 1;
      }
    });
    
    setHoveredNodeId(null);
  };

  const setupExpansion = (centerP: Particle) => {
    const relatedParticles = particlesRef.current.filter(p => p.isResonating && p.id !== centerP.id);
    
    // Sort by strength
    relatedParticles.sort((a, b) => (b.resonanceStrength || 0) - (a.resonanceStrength || 0));

    // Refined Star Shape Layout
    relatedParticles.forEach((p, idx) => {
      const radius = 120 + (idx % 2) * 40; // Alternating radius for star feel
      const angle = (Math.PI * 2 / (relatedParticles.length || 1)) * idx;
      
      p.targetX = centerP.x + Math.cos(angle) * (radius / transformRef.current.scale);
      p.targetY = centerP.y + Math.sin(angle) * (radius / transformRef.current.scale);
      p.targetZ = centerP.z;
      
      p.transitionProgress = 0;
    });

    // Create a random path for pulse flow from related nodes
    if (relatedParticles.length > 0) {
      const pathIds = [centerP.id];
      // Randomly pick a few related nodes to form a path
      const pool = [...relatedParticles].sort(() => Math.random() - 0.5);
      const pathLength = Math.min(pool.length, 5);
      for (let i = 0; i < pathLength; i++) {
        pathIds.push(pool[i].id);
      }
      // Loop back or end? The request shows "A to C to E to B to C" (ends at C)
      // We'll just loop for visual continuity
      pathIds.push(centerP.id); 
      
      neuralFlowRef.current = {
        path: pathIds,
        currentSegment: 0,
        progress: 0
      };
    } else {
      neuralFlowRef.current = { path: [], currentSegment: 0, progress: 0 };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;

    if (isDraggingRef.current) {
      // Horizontal drag rotates Y, Vertical drag rotates Z (or pans if shift is held)
      if (e.shiftKey) {
        transformRef.current.y += dy;
        transformRef.current.x += dx;
      } else {
        transformRef.current.rotationY += dx * 0.01; // Reduced sensitivity from 0.015
        transformRef.current.rotationZ += dy * 0.005; // Lowered Z-rotation sensitivity from 0.015
      }
    }
    
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (draggedParticleRef.current) {
      draggedParticleRef.current.isPaused = false;
      draggedParticleRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const scaleFactor = Math.pow(1.1, delta / 100);
    
    const newScale = Math.min(Math.max(transformRef.current.scale * scaleFactor, 0.1), 5);
    
    // Zoom towards mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const worldX = (mouseX - transformRef.current.x) / transformRef.current.scale;
      const worldY = (mouseY - transformRef.current.y) / transformRef.current.scale;
      
      transformRef.current.scale = newScale;
      transformRef.current.x = mouseX - worldX * newScale;
      transformRef.current.y = mouseY - worldY * newScale;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY } as React.MouseEvent);
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
      const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      
      lastTouchDistRef.current = dist;
      lastTouchMidRef.current = mid;
      isDraggingRef.current = false; // Disable single finger drag
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as React.MouseEvent);
    } else if (e.touches.length === 2 && lastTouchDistRef.current && lastTouchMidRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt((t1.clientX - t2.clientX) ** 2 + (t1.clientY - t2.clientY) ** 2);
      const mid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      
      const scaleFactor = dist / lastTouchDistRef.current;
      const newScale = Math.min(Math.max(transformRef.current.scale * scaleFactor, 0.1), 5);
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const midX = mid.x - rect.left;
        const midY = mid.y - rect.top;
        
        const worldX = (midX - transformRef.current.x) / transformRef.current.scale;
        const worldY = (midY - transformRef.current.y) / transformRef.current.scale;
        
        transformRef.current.scale = newScale;
        transformRef.current.x = midX - worldX * newScale;
        transformRef.current.y = midY - worldY * newScale;
        
        // Pannning with two fingers
        const dx = mid.x - lastTouchMidRef.current.x;
        const dy = mid.y - lastTouchMidRef.current.y;
        transformRef.current.x += dx;
        transformRef.current.y += dy;
      }
      
      lastTouchDistRef.current = dist;
      lastTouchMidRef.current = mid;
    }
  };

  const handleTouchEnd = () => {
    handleMouseUp();
    lastTouchDistRef.current = null;
    lastTouchMidRef.current = null;
  };

  return (
    <div ref={containerRef} className="fixed inset-0 w-full h-full bg-[#080810] z-0 overflow-hidden">
      
      {/* Fixed UI Overlay (Title & Stats) */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-full max-w-7xl px-8 flex flex-col items-center pointer-events-none z-40 select-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <span className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-semibold block">MindDrift</span>
          <h1 className="text-4xl md:text-5xl font-serif text-glow italic">
            {title || 'Tree'}
          </h1>
          {subtitle && (
            <p className="text-white/40 text-[10px] uppercase tracking-widest max-w-[300px] mx-auto mt-2 font-medium leading-relaxed">
              {subtitle}
            </p>
          )}
        </motion.div>

        <div className="mt-6 flex justify-center gap-16">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-center">
            <p className="text-xl font-serif text-white/80 italic">{fragmentsCount || 0}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/20 font-bold mt-1">Fragments</p>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="text-center">
            <p className="text-xl font-serif text-white/80 italic">{driftsCount || 0}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/20 font-bold mt-1">Drifts</p>
          </motion.div>
        </div>
      </div>
      
      {/* Clustering Loading State */}
      <AnimatePresence>
        {isClustering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-4 px-8 py-6 glass rounded-2xl"
          >
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="text-xs uppercase tracking-[0.2em] text-white/60 font-medium">
              Cultivating your Drift Tree...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas 
        ref={canvasRef} 
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Visual Legend */}
      <div className="absolute bottom-28 right-8 z-40 pointer-events-none select-none text-right space-y-2">
        <div className="flex items-center justify-end gap-2 text-primary/80">
          <span className="text-[9px] uppercase tracking-widest font-bold">Focus Path (A→B→C)</span>
          <div className="w-12 h-[1px] bg-white/40 dashed-border" />
        </div>
        <div className="flex items-center justify-end gap-2">
          <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Branch (Theme)</span>
          <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(255,78,0,0.5)]" />
        </div>
        <div className="flex items-center justify-end gap-2">
          <span className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Petal (Thought)</span>
          <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
        </div>
      </div>

      {/* Thought Path Summary */}
      {clusterData?.thought_path && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute bottom-28 left-8 z-40 max-w-[280px] space-y-3 pointer-events-auto"
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-3 bg-primary rounded-full" />
            <span className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Recent Focus Journey</span>
          </div>
          <div className="glass-dark p-4 rounded-xl border border-white/5 shadow-xl">
            <p className="text-[11px] text-white/70 leading-relaxed font-serif italic">
              {clusterData.thought_path.evolution_summary}
            </p>
          </div>
        </motion.div>
      )}

      {/* Resonance Subtitle Bar */}
      {resonanceMode && (
        <div className="absolute bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-full max-w-[80vw] overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[9px] uppercase tracking-[0.3em] text-white/30 font-medium whitespace-nowrap text-center"
          >
            {resonanceMode === 'expand' && hoveredNodeId ? (
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: '-100%' }}
                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                className="inline-block"
              >
                {particlesRef.current.find(p => p.id === hoveredNodeId)?.content}
              </motion.div>
            ) : (
              `${resonatingCount} thoughts resonating`
            )}
          </motion.div>
        </div>
      )}

      {/* Thought Content Card */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-40 left-6 right-6 p-6 glass-dark rounded-2xl border border-white/8 z-20 max-h-[50%] overflow-y-auto shadow-2xl"
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 space-y-2">
                {selectedNode.clusterTheme && (
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">
                    {selectedNode.clusterTheme}
                  </div>
                )}
                <p className="text-sm font-light text-white/90 leading-relaxed italic font-serif">
                  "{selectedNode.content}"
                </p>
                <div className="pt-4">
                  <button
                    onClick={() => onNodeClick?.(selectedNode.id)}
                    className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-[10px] uppercase tracking-widest transition-all border border-white/10"
                  >
                    View Details {resonatingCount > 0 && `(${resonatingCount} Resonating)`}
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  if (selectedNode) {
                    const centerP = particlesRef.current.find(p => p.id === selectedNode.id);
                    if (centerP) {
                      handlePulseStart(centerP);
                      // Trigger focus path growth after the pulse has some time to shine
                      setTimeout(() => {
                        journeyPathRef.current.isGrowing = true;
                        journeyPathRef.current.growthStartTime = Date.now();
                        // Reset growing after some time
                        setTimeout(() => {
                          journeyPathRef.current.isGrowing = false;
                        }, 4000);
                      }, 1000);
                    }
                  }
                  setSelectedNode(null);
                }}
                className="p-1.5 rounded-full bg-white/5 text-white/40 hover:text-white transition-all flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
