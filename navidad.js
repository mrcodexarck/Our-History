// navidad.js
(function() {
    const hoy = new Date();
    const esDiciembre = hoy.getMonth() === 11; 
    
    const urlParams = new URLSearchParams(window.location.search);
    const forzarNavidad = urlParams.has('navidad') || localStorage.getItem('modo-navidad') === 'true';
    const apagarNavidad = urlParams.has('normal') || localStorage.getItem('modo-navidad') === 'false';

    const activarNavidad = (esDiciembre || forzarNavidad) && !apagarNavidad;

    if (!activarNavidad) return;

    // ==========================================
    // 1. ESTILOS NAVIDEÑOS SUAVES (CSS)
    // ==========================================
    const estilo = document.createElement('style');
    estilo.innerHTML = `
        body {
            background-color: #0b1310 !important;
            background-image: 
                radial-gradient(circle at 50% 0%, rgba(28, 70, 50, 0.4), transparent 70%),
                radial-gradient(circle at 80% 80%, rgba(100, 30, 30, 0.2), transparent 50%) !important;
            color: #f8eedb !important;
            transition: background 1s ease;
        }

        /* Brillo suave y mágico para los módulos (sin cambiar su forma original) */
        .menu-card, .card, .app-module, div[class*="card"], div[class*="box"], section[class*="card"] {
            box-shadow: 
                0 10px 30px rgba(0, 0, 0, 0.5),
                0 0 15px rgba(212, 175, 55, 0.15) !important; /* Brillo dorado sutil */
            border: 1px solid rgba(212, 175, 55, 0.2) !important;
            transition: box-shadow 0.4s ease, transform 0.3s ease;
        }

        /* Al tocar, la caja brilla más */
        .menu-card:active, .card:active, .app-module:active, div[class*="card"]:active {
            box-shadow: 
                0 5px 15px rgba(0, 0, 0, 0.6),
                0 0 25px rgba(212, 175, 55, 0.4) !important; 
            transform: scale(0.98);
        }

        /* Textos con brillo festivo */
        .fecha-dia, .fecha-anio, .tab-num, h1, h2, h3 {
            color: #f4d03f !important;
            text-shadow: 0 0 12px rgba(244, 208, 63, 0.4) !important;
        }

        /* Botones activos */
        .tab.active, .btn-menu.abierto, .perfil-opcion:hover, .menu-item.active {
            background: linear-gradient(135deg, #c0392b, #922b21) !important;
            color: #fff !important;
            border-color: #f4d03f !important;
            box-shadow: 0 0 15px rgba(192, 57, 43, 0.5) !important;
        }

        /* Evitar que el lienzo brille (para que dibujen cómodo) */
        .canvas-wrapper, .canvas-area, .canvas-surface {
            background: #fdfaf3 !important;
            box-shadow: 0 5px 20px rgba(0,0,0,0.5) !important;
            border: none !important;
        }
        
        /* Asegurar que el contenido esté sobre las partículas */
        body > *:not(#canvas-navidad) {
            position: relative;
            z-index: 10 !important;
        }
    `;
    document.head.appendChild(estilo);

    // ==========================================
    // 2. PARTÍCULAS VIVAS: EMOJIS + LUCES TITILANTES
    // ==========================================
    const canvasNavidad = document.createElement('canvas');
    canvasNavidad.id = 'canvas-navidad'; 
    canvasNavidad.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
    document.body.appendChild(canvasNavidad);
    
    const ctx = canvasNavidad.getContext('2d');
    let ancho = window.innerWidth;
    let alto = window.innerHeight;
    canvasNavidad.width = ancho;
    canvasNavidad.height = alto;

    const particulas = [];
    const emojisNavidad = ['🎅', '🎄', '🎁', '🔔', '✨', '❄️']; 

    // Creamos dos tipos de partículas: Emojis (caen) y Luces (flotan y titilan)
    for (let i = 0; i < 40; i++) {
        const esEmoji = Math.random() > 0.4; // 60% son emojis, 40% son luces
        
        particulas.push({
            tipo: esEmoji ? 'emoji' : 'luz',
            x: Math.random() * ancho,
            y: Math.random() * alto,
            size: esEmoji ? Math.random() * 15 + 15 : Math.random() * 3 + 1.5, // Emojis grandes, luces pequeñas
            contenido: esEmoji ? emojisNavidad[Math.floor(Math.random() * emojisNavidad.length)] : null,
            velocidadY: esEmoji ? Math.random() * 1.5 + 1 : Math.random() * 0.5 - 0.25, // Emojis caen, luces flotan
            velocidadX: Math.random() * 0.4 - 0.2, 
            rotacion: Math.random() * Math.PI * 2,
            velRotacion: esEmoji ? (Math.random() - 0.5) * 0.04 : 0,
            // Para el efecto de titileo en las luces
            opacidad: Math.random(),
            velocidadTitileo: Math.random() * 0.03 + 0.01,
            colorLuz: Math.random() > 0.5 ? '#f4d03f' : '#ffffff' // Dorado o blanco
        });
    }

    function animarNavidad() {
        ctx.clearRect(0, 0, ancho, alto);

        for (let i = 0; i < particulas.length; i++) {
            const p = particulas[i];

            if (p.tipo === 'emoji') {
                // DIBUJAR EMOJI
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotacion);
                ctx.font = `${p.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
                ctx.globalAlpha = 0.9; 
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.contenido, 0, 0);
                ctx.restore();

                // Movimiento de zigzag más orgánico
                p.y += p.velocidadY;
                p.x += p.velocidadX + Math.sin(p.y / 40) * 0.8; 
                p.rotacion += p.velRotacion;

                if (p.y > alto + 40) { p.y = -40; p.x = Math.random() * ancho; }
            } else {
                // DIBUJAR LUZ (FORMA ESTÁNDAR)
                // El titileo se logra cambiando la opacidad constantemente
                p.opacidad += p.velocidadTitileo;
                if (p.opacidad > 1 || p.opacidad < 0.2) p.velocidadTitileo *= -1;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.colorLuz;
                ctx.globalAlpha = p.opacidad;
                
                // Efecto de resplandor (glow) para las luces
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.colorLuz;
                ctx.fill();
                ctx.shadowBlur = 0; // Resetear

                // Las luces flotan lentamente
                p.y += p.velocidadY;
                p.x += p.velocidadX;

                // Reiniciar luces que salen de pantalla
                if (p.y < -10) p.y = alto + 10;
                if (p.y > alto + 10) p.y = -10;
            }

            // Límites horizontales
            if (p.x > ancho + 40) p.x = -40;
            if (p.x < -40) p.x = ancho + 40;
        }
        requestAnimationFrame(animarNavidad);
    }
    animarNavidad();

    window.addEventListener('resize', () => {
        ancho = window.innerWidth;
        alto = window.innerHeight;
        canvasNavidad.width = ancho;
        canvasNavidad.height = alto;
    });
})();