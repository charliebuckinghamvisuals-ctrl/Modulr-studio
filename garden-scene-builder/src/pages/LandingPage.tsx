import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'motion/react';
import { LANDING_PAGE_IMAGES } from '../config/images';

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#3b4d4a] font-sans overflow-x-hidden selection:bg-[#3b4d4a]/30">
      {/* Brand Header */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md grid grid-cols-2 md:grid-cols-3 items-center px-8 z-50 border-b border-black/5">
        <div className="flex items-center justify-start">
          <Link to="/">
            <span className="font-display font-bold tracking-widest text-xl text-[#3b4d4a]">MODULR <span className="font-light">3D</span></span>
          </Link>
        </div>
        <nav className="hidden md:flex items-center justify-center gap-8 text-xs font-semibold tracking-widest uppercase text-[#3b4d4a]/70">
          <a href="#vision" className="hover:text-[#3b4d4a] transition-colors">Vision</a>
          <a href="#process" className="hover:text-[#3b4d4a] transition-colors">Process</a>
          <a href="#ai-visuals" className="hover:text-[#3b4d4a] transition-colors">AI Visuals</a>
          <a href="#planning" className="hover:text-[#3b4d4a] transition-colors">Planning</a>
          <Link to="/business" className="hover:text-[#3b4d4a] transition-colors text-[#3b4d4a]">Businesses</Link>
        </nav>
        <div className="flex justify-end">
          <Link 
            to="/builder" 
            className="text-xs uppercase tracking-widest font-bold bg-[#3b4d4a] text-white px-6 py-3 rounded-full hover:bg-[#2d3a38] transition-transform hover:scale-105 shadow-sm"
          >
            Start Designing
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden pt-20">
        <motion.div style={{ y, opacity }} className="absolute inset-0 z-0">
          <img 
            src={LANDING_PAGE_IMAGES.heroBackground} 
            alt="Modern Garden Room" 
            className="w-full h-full object-cover opacity-40 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#fafaf9]/80 via-[#fafaf9]/40 to-[#fafaf9]"></div>
        </motion.div>
        
        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-block py-1 px-3 rounded-full bg-white/60 backdrop-blur-sm border border-black/5 text-xs font-semibold tracking-widest text-[#3b4d4a] mb-6 uppercase">
              The Future of Space
            </span>
            <h1 className="text-6xl md:text-8xl font-light tracking-tight mb-6 text-[#3b4d4a] leading-[1.1]">
              Design your <br/>
              <span className="font-serif italic text-[#3b4d4a]">perfect</span> space.
            </h1>
            <p className="text-lg md:text-xl text-[#3b4d4a]/70 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
              The complete garden room hub. Design your structure in pristine 3D, generate hyper-realistic AI visuals with Modulr Studio, and navigate planning permissions seamlessly.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                to="/builder" 
                className="group inline-flex items-center gap-3 bg-[#3b4d4a] text-white px-8 py-4 rounded-full text-sm font-semibold tracking-wide shadow-xl hover:bg-[#2d3a38] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
              >
                Launch Configurator
                
              </Link>
              <a 
                href="#vision" 
                className="inline-flex items-center gap-3 bg-white text-[#3b4d4a] px-8 py-4 rounded-full text-sm font-semibold tracking-wide shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                Explore Features
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section id="vision" className="py-32 relative z-20 bg-[#2d3a38] text-white overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src={LANDING_PAGE_IMAGES.visionBackground} 
            alt="Vision Background" 
            className="w-full h-full object-cover opacity-20 mix-blend-overlay"
          />
        </div>
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="mb-20 md:text-center max-w-3xl mx-auto"
          >
            <h2 className="text-4xl md:text-5xl font-light tracking-tight mb-6 text-white">Visualize every detail in <span className="font-serif italic text-white">stunning 3D</span>.</h2>
            <p className="text-white/70 text-lg font-light leading-relaxed">
              Every dimension, material choice, and layout change updates immediately in pristine 3D. See exactly how your garden room will look before a single piece of wood is cut.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[320px]">
            {/* Large Bento Box */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
              whileHover={{ y: -5 }}
              className="md:col-span-2 relative rounded-[2rem] overflow-hidden group shadow-lg border border-white/20"
            >
              <img 
                src={LANDING_PAGE_IMAGES.premiumMaterials} 
                alt="Cedar Timber Cladding" 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              
              <div className="absolute bottom-0 left-0 p-8 md:p-12 w-full">
                
                <h3 className="font-light text-2xl md:text-3xl tracking-tight text-white mb-3">Realistic Materials</h3>
                <p className="text-white/80 font-light leading-relaxed max-w-lg text-lg">
                  Experience true-to-life textures and lighting. Visualize the exact finish of your dream garden room.
                </p>
              </div>
            </motion.div>

            {/* Small Bento Box 1 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              whileHover={{ y: -5 }}
              className="relative rounded-[2rem] overflow-hidden group shadow-lg bg-white/10 backdrop-blur-md border border-white/20 text-white p-8 flex flex-col justify-end"
            >
              
              <h3 className="font-light text-2xl tracking-tight mb-3 relative z-10">Real-time Pricing</h3>
              <p className="text-white/70 font-light leading-relaxed relative z-10">
                Get a better idea of pricing. Watch your estimated cost update instantly as you design.
              </p>
            </motion.div>

            {/* Small Bento Box 2 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.3 }}
              whileHover={{ y: -5 }}
              className="relative rounded-[2rem] overflow-hidden group shadow-lg bg-white/10 backdrop-blur-md border border-white/20 p-8 flex flex-col justify-end"
            >
              
              <h3 className="font-light text-2xl tracking-tight text-white mb-3 mt-auto">Flexible Layouts</h3>
              <p className="text-white/70 font-light leading-relaxed">
                Add L-shapes, cut-outs, and custom partitions with drag-and-drop simplicity.
              </p>
            </motion.div>

            {/* Small Bento Box 3 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: 0.4 }}
              whileHover={{ y: -5 }}
              className="md:col-span-2 relative rounded-[2rem] overflow-hidden group shadow-lg bg-[#3b4d4a] border border-white/20 p-8 md:p-12 flex flex-col justify-center"
            >
              <img 
                src={LANDING_PAGE_IMAGES.exportBuild} 
                alt="3D Configuration" 
                className="absolute inset-0 w-full h-full object-cover opacity-100 transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40"></div>
              
              <div className="relative z-10">
                <h3 className="font-light text-3xl md:text-4xl tracking-tight text-white mb-4">Export & Build</h3>
                <p className="text-white/90 font-light leading-relaxed max-w-xl text-lg mb-6">
                  Generate a comprehensive design document in seconds. Your custom PDF includes detailed 3D renders, architectural elevations, and a complete materials list.
                </p>
                <div className="flex gap-4">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-white/20 border border-white/20 px-4 py-2 rounded-full shadow-sm backdrop-blur-md"> Instant PDF</span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-white/20 border border-white/20 px-4 py-2 rounded-full shadow-sm backdrop-blur-md"> Ready for Quotes</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      
      {/* Modulr Studio AI Section */}
      <section id="ai-visuals" className="py-32 relative overflow-hidden bg-[#fafaf9] text-[#3b4d4a] border-y border-black/5">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="order-2 md:order-1 relative"
            >
              <div className="aspect-video md:aspect-[4/5] rounded-[2rem] overflow-hidden relative shadow-2xl">
                <img src={LANDING_PAGE_IMAGES.heroBackground} alt="AI Visualisation" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                    <span className="text-white text-xs font-bold tracking-widest uppercase">Modulr Studio Active</span>
                  </div>
                  <p className="text-white/90 text-sm">Hyper-realistic render generated in 12 seconds.</p>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="order-1 md:order-2"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#3b4d4a]/10 text-[#3b4d4a] text-xs font-semibold tracking-widest uppercase mb-8">
                Powered by AI
              </div>
              <h2 className="text-4xl md:text-5xl font-light tracking-tight mb-6">
                Meet <span className="font-serif italic font-semibold">Modulr Studio</span>.
              </h2>
              <p className="text-lg text-[#3b4d4a]/70 font-light leading-relaxed mb-8">
                Instantly turn your 3D configuration into hyper-realistic CGI visuals. Our integrated AI engine, Modulr Studio, creates stunning, true-to-life images of your garden room in seconds. Perfect for providers and customers alike.
              </p>
              
              <ul className="space-y-6 mb-10">
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-[#3b4d4a]/10 p-2 rounded-full text-[#3b4d4a]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-1">Instant Generation</h4>
                    <p className="text-[#3b4d4a]/60 font-light">No more waiting days for renders. Generate beautiful CGI images instantly from any angle.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-[#3b4d4a]/10 p-2 rounded-full text-[#3b4d4a]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-1">Photorealistic Detail</h4>
                    <p className="text-[#3b4d4a]/60 font-light">AI models trained specifically on high-end garden rooms to capture perfect lighting, reflections, and materials.</p>
                  </div>
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  to="/builder"
                  className="bg-[#3b4d4a] text-white px-8 py-4 rounded-full text-sm font-semibold tracking-wide hover:bg-[#2d3a38] transition-all duration-300 text-center shadow-lg hover:-translate-y-1"
                >
                  Try Modulr Studio
                </Link>
                <a 
                  href="https://www.modulrstudio.co.uk" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-white text-[#3b4d4a] border border-black/10 px-8 py-4 rounded-full text-sm font-semibold tracking-wide hover:bg-gray-50 transition-all duration-300 text-center"
                >
                  Visit modulrstudio.co.uk
                </a>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Expanded Planning Section */}
      <section id="planning" className="py-32 relative overflow-hidden bg-[#3b4d4a] text-white">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-xs font-semibold tracking-widest uppercase mb-8">
                
                Planning & Compliance
              </div>
              <h2 className="text-4xl md:text-5xl font-light tracking-tight mb-6">Expert planning advice, built in.</h2>
              <p className="text-lg text-white/70 font-light leading-relaxed mb-8">
                Navigating Permitted Development rules and planning permissions can be daunting. We've partnered with the National Annexe Planning Consultancy (NAPC) to ensure your dream space can become a reality.
              </p>
              
              <ul className="space-y-6 mb-10">
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-white/10 p-2 rounded-full"></div>
                  <div>
                    <h4 className="text-xl font-semibold mb-1">Permitted Development</h4>
                    <p className="text-white/60 font-light">Many garden rooms don't require full planning permission if they meet specific height and boundary criteria. Our tool helps you stay within these limits.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="mt-1 bg-white/10 p-2 rounded-full"></div>
                  <div>
                    <h4 className="text-xl font-semibold mb-1">Certificates of Lawfulness</h4>
                    <p className="text-white/60 font-light">Even if planning permission isn't needed, obtaining a certificate ensures your build is legally sound for future property sales.</p>
                  </div>
                </li>
              </ul>

              <div className="flex flex-col sm:flex-row gap-4">
                <a 
                  href="https://napc.uk" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="bg-white text-[#3b4d4a] px-8 py-4 rounded-full text-sm font-semibold tracking-wide hover:bg-gray-100 transition-all duration-300 text-center"
                >
                  Consult the NAPC
                </a>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-[4/3] md:aspect-[3/2] rounded-[2rem] overflow-hidden relative shadow-2xl">
                <img src={LANDING_PAGE_IMAGES.architecturalPlanning} alt="Architectural Planning" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-[#3b4d4a] mix-blend-multiply opacity-40"></div>
                
                {/* Floating Card */}
                <div className="absolute bottom-8 left-8 right-8 bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                  <div className="flex items-center gap-4 mb-2">
                    <img src="https://napc.uk/wp-content/uploads/2023/10/NAPC-Logo.png" alt="NAPC Logo" className="h-10 bg-white p-2 rounded" onError={(e) => e.currentTarget.style.display = 'none'} />
                    <span className="font-semibold text-lg">Official Partner</span>
                  </div>
                  <p className="text-sm text-white/80 font-light">Trusted by thousands of UK homeowners for secure, compliant garden room developments.</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-16 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-2xl tracking-widest text-[#3b4d4a]">MODULR <span className="font-light">3D</span></span>
          </div>
          <nav className="flex gap-8 text-sm font-semibold text-[#3b4d4a]/70">
             <a href="#vision" className="hover:text-[#3b4d4a]">Vision</a>
             <a href="#planning" className="hover:text-[#3b4d4a]">Planning</a>
             <Link to="/business" className="hover:text-[#3b4d4a]">Businesses</Link>
          </nav>
          <p className="text-sm text-[#3b4d4a]/50 font-light">
            © {new Date().getFullYear()} MODULR Configurator. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
