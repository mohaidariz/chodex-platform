import Link from 'next/link'
import { Bot, FileText, MessageSquare, Mail, Zap, Shield, Globe, ArrowRight, Check } from 'lucide-react'

const features = [
  {
    icon: FileText,
    title: 'Document Intelligence',
    description:
      'Upload PDFs, Word docs, and text files. Chodex automatically processes and indexes your content using vector embeddings.',
  },
  {
    icon: MessageSquare,
    title: 'Conversational AI',
    description:
      'Your visitors get accurate, context-aware answers powered by Azure OpenAI and your own documentation.',
  },
  {
    icon: Zap,
    title: 'Learns Over Time',
    description:
      'Every conversation is analyzed for insights. Chodex identifies knowledge gaps and improves over time.',
  },
  {
    icon: Mail,
    title: 'Email Summaries',
    description:
      'Automatically send conversation summaries to visitors so they can reference the answers later.',
  },
  {
    icon: Shield,
    title: 'Multi-Tenant & Secure',
    description:
      'Each organization gets isolated data with row-level security. Your documents stay private and protected.',
  },
  {
    icon: Globe,
    title: 'Embeddable Widget',
    description:
      'Add your AI assistant to any website with a single iframe snippet. Fully customizable branding.',
  },
]

const plans = [
  {
    name: 'Free',
    price: '0',
    description: 'Get started for free',
    features: ['5 documents', '500 messages/month', '1 user', 'Basic analytics'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '49',
    description: 'For growing teams',
    features: [
      'Unlimited documents',
      '10,000 messages/month',
      '5 users',
      'Email summaries',
      'Priority support',
      'Custom branding',
    ],
    cta: 'Start free trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations',
    features: [
      'Everything in Pro',
      'Unlimited users',
      'SSO / SAML',
      'SLA guarantee',
      'Dedicated support',
      'On-premise option',
    ],
    cta: 'Contact sales',
    highlight: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-slate-200 sticky top-0 bg-white/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg">Chodex</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5 text-sm text-blue-700 font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            Powered by Azure OpenAI + pgvector
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight mb-6">
            Turn your documents into{' '}
            <span className="text-blue-600">an intelligent assistant</span>
          </h1>
          <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed mb-10">
            Chodex lets you upload your documentation and instantly create an AI chatbot
            that answers customer questions, learns from conversations, and sends email summaries.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
            >
              Start for free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/chatbot/demo"
              className="inline-flex items-center gap-2 text-slate-700 border border-slate-300 font-medium px-8 py-3.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Bot className="w-4 h-4" />
              Try live demo
            </Link>
          </div>
          <p className="text-xs text-slate-400 mt-4">No credit card required · Free plan available</p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Everything you need to deploy AI support
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto">
              From document ingestion to conversational AI and automated emails — all in one platform.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Get started in minutes</h2>
            <p className="text-slate-500">No complex setup. No engineering required.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Upload documents', desc: 'Upload PDFs, Word docs, or text files. We process and index everything automatically.' },
              { step: '02', title: 'Embed on your site', desc: 'Copy a single iframe snippet and add it anywhere on your website or app.' },
              { step: '03', title: 'AI answers questions', desc: 'Visitors get accurate, source-backed answers from your documentation instantly.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-4">
                  {step}
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-slate-50 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-500">Start free, upgrade as you grow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map(({ name, price, description, features: planFeatures, cta, highlight }) => (
              <div
                key={name}
                className={`rounded-2xl border p-7 relative ${
                  highlight
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-600/30'
                    : 'bg-white border-slate-200'
                }`}
              >
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <p className={`font-semibold text-sm ${highlight ? 'text-blue-100' : 'text-slate-500'}`}>
                  {name}
                </p>
                <div className="mt-2 mb-1">
                  <span className="text-4xl font-extrabold">
                    {price === 'Custom' ? 'Custom' : `$${price}`}
                  </span>
                  {price !== 'Custom' && (
                    <span className={`text-sm ml-1 ${highlight ? 'text-blue-200' : 'text-slate-400'}`}>
                      /month
                    </span>
                  )}
                </div>
                <p className={`text-sm mb-6 ${highlight ? 'text-blue-100' : 'text-slate-500'}`}>
                  {description}
                </p>
                <ul className="space-y-2.5 mb-8">
                  {planFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-blue-200' : 'text-green-500'}`} />
                      <span className={highlight ? 'text-blue-50' : 'text-slate-700'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`block text-center py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
                    highlight
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Ready to deploy your AI assistant?
          </h2>
          <p className="text-slate-500 mb-8">
            Join teams using Chodex to automate customer support and extract insights from their documentation.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
          >
            Get started for free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-700">Chodex</span>
          </div>
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} Chodex. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
