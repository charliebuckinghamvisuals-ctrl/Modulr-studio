import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';

export default function BusinessPage() {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#292524] font-sans overflow-x-hidden selection:bg-[#3b4d4a]/30">
      {/* Brand Header */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md grid grid-cols-2 md:grid-cols-3 items-center px-8 z-50 border-b border-black/5">
        <div className="flex items-center justify-start">
          <Link to="/">
            <span className="font-display font-bold tracking-widest text-xl text-[#3b4d4a]">MODULR <span className="font-light">3D</span></span>
          </Link>
        </div>
        <nav className="hidden md:flex items-center justify-center gap-8 text-xs font-semibold tracking-widest uppercase text-gray-500">
          <Link to="/" className="hover:text-[#3b4d4a] transition-colors">Home</Link>
          <a href="#features" className="hover:text-[#3b4d4a] transition-colors">Business Features</a>
          <a href="#pricing" className="hover:text-[#3b4d4a] transition-colors">Pricing</a>
        </nav>
        <div className="flex justify-end">
          <Link 
            to="/builder" 
            className="text-xs uppercase tracking-widest font-bold bg-[#3b4d4a] text-white px-6 py-3 rounded-full hover:bg-[#2d3a38] transition-transform hover:scale-105 shadow-sm"
          >
            Try Configurator
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <span className="text-[#3b4d4a] font-semibold tracking-widest uppercase text-xs mb-4 block">Modulr for Business</span>
          <h1 className="text-4xl md:text-6xl font-light tracking-tight mb-6 text-[#292524] leading-tight">
            Supercharge your <br /> garden room sales.
          </h1>
          <p className="text-base md:text-lg text-gray-600 mb-10 max-w-2xl mx-auto font-light leading-relaxed">
            Embed our cutting-edge 3D configurator directly onto your website. Capture high-quality leads, let clients visualize their designs, and streamline your quoting process.
          </p>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 relative z-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            <div className="flex flex-col text-left">
              <div className="w-12 h-12 bg-[#fafaf9] rounded-xl flex items-center justify-center mb-6 text-[#3b4d4a] shadow-sm border border-gray-100">
                <Check size={20} />
              </div>
              <h3 className="font-light text-xl tracking-tight text-[#292524] mb-3">White-Label Branding</h3>
              <p className="text-gray-500 font-light leading-relaxed">
                Add your own logo, brand colors, and custom fonts. The configurator looks and feels like a seamless part of your website.
              </p>
            </div>
            
            <div className="flex flex-col text-left">
              <div className="w-12 h-12 bg-[#fafaf9] rounded-xl flex items-center justify-center mb-6 text-[#3b4d4a] shadow-sm border border-gray-100">
                <Check size={20} />
              </div>
              <h3 className="font-light text-xl tracking-tight text-[#292524] mb-3">Custom Pricing Engine</h3>
              <p className="text-gray-500 font-light leading-relaxed">
                Set your exact material costs, base prices, and labor rates. The configurator generates accurate, real-time quotes for your customers.
              </p>
            </div>
            
            <div className="flex flex-col text-left">
              <div className="w-12 h-12 bg-[#fafaf9] rounded-xl flex items-center justify-center mb-6 text-[#3b4d4a] shadow-sm border border-gray-100">
                <Check size={20} />
              </div>
              <h3 className="font-light text-xl tracking-tight text-[#292524] mb-3">Lead Capture & PDF</h3>
              <p className="text-gray-500 font-light leading-relaxed">
                Users submit their email to download their design PDF. You receive the full 3D specs, elevations, and material choices instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-[#fafaf9]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-light tracking-tight mb-4 text-[#292524]">Simple, transparent pricing.</h2>
          <p className="text-gray-500 text-base max-w-xl mx-auto font-light leading-relaxed mb-16">
            Everything you need to offer a world-class 3D experience to your customers.
          </p>

          <div className="bg-white rounded-3xl p-10 md:p-14 shadow-xl border border-black/5 max-w-lg mx-auto relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-[#3b4d4a]"></div>
            <h3 className="text-2xl font-semibold text-[#292524] mb-2">Pro Business</h3>
            <div className="text-5xl font-light tracking-tight text-[#3b4d4a] mb-6">
              £149 <span className="text-lg text-gray-400 font-normal">/mo</span>
            </div>
            <p className="text-sm text-gray-500 mb-8 font-light">
              Perfect for garden room manufacturers and installers looking to scale their digital presence.
            </p>
            
            <ul className="text-left space-y-4 mb-10">
              <li className="flex items-center gap-3 text-gray-600 font-light">
                <Check size={18} className="text-[#3b4d4a]" /> Unlimited 3D configurations
              </li>
              <li className="flex items-center gap-3 text-gray-600 font-light">
                <Check size={18} className="text-[#3b4d4a]" /> Website embedding via Iframe
              </li>
              <li className="flex items-center gap-3 text-gray-600 font-light">
                <Check size={18} className="text-[#3b4d4a]" /> Custom branding & colors
              </li>
              <li className="flex items-center gap-3 text-gray-600 font-light">
                <Check size={18} className="text-[#3b4d4a]" /> Custom pricing logic control
              </li>
              <li className="flex items-center gap-3 text-gray-600 font-light">
                <Check size={18} className="text-[#3b4d4a]" /> Lead capture system
              </li>
              <li className="flex items-center gap-3 text-gray-600 font-light">
                <Check size={18} className="text-[#3b4d4a]" /> Custom PDF export branding
              </li>
            </ul>

            <button className="w-full py-4 rounded-xl bg-[#3b4d4a] text-white font-semibold tracking-wide hover:bg-[#2d3a38] transition-colors">
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-lg tracking-widest text-[#3b4d4a]">MODULR <span className="font-light">3D</span></span>
          </div>
          <p className="text-sm text-gray-400 font-light">
            © {new Date().getFullYear()} MODULR Garden Room Configurator. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
