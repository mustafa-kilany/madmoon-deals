// Sahla's privacy policy, terms and the Sanad consent text (BACKEND_PLAN B15.8),
// in Arabic and English. One source for the app's screens and the server's
// public pages (/v1/legal/privacy, /v1/legal/terms, for the Play Store).
//
// DRAFT: written for the product as built (escrow, couriers, Sanad, Jordan's
// Personal Data Protection Law No. 24 of 2023). A Jordanian lawyer must review
// it before launch. Changing a document = a new LEGAL_VERSION: signed-in users
// are asked to accept the new version.

import type { Localized } from '@/lib/types';

/** The version people accept at sign-up (stored with the account). */
export const LEGAL_VERSION = '2026-11-09';
/** The Sanad consent people give before each ID check (stored with the check). */
export const SANAD_CONSENT_VERSION = '2026-11-07';

export type LegalSection = { title: Localized; body: Localized };
export type LegalDoc = { title: Localized; sections: LegalSection[] };
export type LegalDocId = 'privacy' | 'terms';

const s = (titleEn: string, titleAr: string, en: string, ar: string): LegalSection => ({
  title: { en: titleEn, ar: titleAr },
  body: { en, ar },
});

export const privacyPolicy: LegalDoc = {
  title: { en: 'Privacy Policy', ar: 'سياسة الخصوصية' },
  sections: [
    s(
      'Who we are',
      'من نحن',
      'Sahla is a marketplace in Jordan for buying and selling second-hand items, with payment held by Sahla until delivery and delivery by Sahla’s drivers. This policy explains what personal data we collect, why, who we share it with and your rights under Jordan’s Personal Data Protection Law No. 24 of 2023.',
      'سهلة سوق في الأردن لبيع وشراء المنتجات المستعملة، يُحفظ فيه المبلغ لدى سهلة حتى التسليم ويتم التوصيل بواسطة سائقي سهلة. توضح هذه السياسة البيانات الشخصية التي نجمعها ولماذا ومع من نشاركها وحقوقك بموجب قانون حماية البيانات الشخصية الأردني رقم 24 لسنة 2023.',
    ),
    s(
      'What we collect',
      'ما الذي نجمعه',
      '• Account: your name, email, password (stored only as a secure hash) or your Google / Apple sign-in, your area and profile picture.\n• Listings: photos (we remove location data from them), descriptions, prices, and the pickup phone and address you give for our driver (never shown to buyers).\n• Test certificates for phones and electronics: the photo of the shop’s report. The original, which can show the IMEI or serial number, is kept private for our team; buyers see a copy with those numbers blurred.\n• Orders: what you bought or sold, the delivery name, phone and address, and the payment status. Card details are handled by our payment provider; we never see or store your card number.\n• Sellers’ bank account: the account holder’s name and IBAN, so we can send your money. The IBAN is stored encrypted; only the staff who send payments can see it.\n• Chats and offers with other users, and messages to our support team.\n• Identity check (only if you choose to verify with Sanad): see “Verifying your identity”.\n• Your phone: a random app identifier, the notification token and the app language. Your location is used only when you ask to fill your address, to find your area and street; we don’t store or log the coordinates.\n• Records of reports, blocks and safety checks, and technical logs (IP address, time, the page of the app that was called).',
      '• الحساب: اسمك وبريدك الإلكتروني وكلمة المرور (تُحفظ مُشفّرة فقط) أو دخولك عبر Google / Apple، ومنطقتك وصورتك.\n• الإعلانات: الصور (نزيل منها بيانات الموقع) والوصف والسعر، ورقم الهاتف والعنوان الذي تعطيه لسائقنا للاستلام (لا يظهر للمشترين أبداً).\n• شهادات فحص الهواتف والإلكترونيات: صورة تقرير المحل. تبقى الصورة الأصلية التي قد تُظهر رقم IMEI أو الرقم التسلسلي خاصة بفريقنا، ويرى المشترون نسخة مموّهة الأرقام.\n• الطلبات: ما اشتريته أو بعته، واسم ورقم وعنوان التوصيل، وحالة الدفع. يتولى مزوّد الدفع بيانات البطاقة؛ لا نرى رقم بطاقتك ولا نحفظه.\n• الحساب البنكي للبائع: اسم صاحب الحساب ورقم الآيبان، لنرسل إليك أموالك. يُحفظ الآيبان مشفّراً، ولا يراه إلا الموظفون الذين يرسلون الدفعات.\n• المحادثات والعروض مع المستخدمين الآخرين، ورسائلك لفريق الدعم.\n• التحقق من الهوية (فقط إن اخترت التوثيق عبر سند): انظر «توثيق هويتك».\n• هاتفك: معرّف عشوائي للتطبيق، ورمز الإشعارات، ولغة التطبيق. نستخدم موقعك فقط عندما تطلب تعبئة عنوانك لمعرفة منطقتك وشارعك، ولا نحفظ الإحداثيات ولا نسجّلها.\n• سجلات البلاغات والحظر وفحوص الأمان، والسجلات التقنية (عنوان IP والوقت والجزء الذي طُلب من التطبيق).',
    ),
    s(
      'Why we use it',
      'لماذا نستخدمها',
      'To run your account and the marketplace; to hold payments until delivery and pay sellers; to deliver orders (our driver sees the pickup and delivery details of the orders assigned to them); to send codes, receipts and notifications; to answer support; to keep Sahla safe (fraud checks flag suspicious accounts for a human to review — they never act on their own); and to meet our legal obligations.',
      'لإدارة حسابك والسوق؛ ولحفظ المبالغ حتى التسليم والدفع للبائعين؛ ولتوصيل الطلبات (يرى السائق تفاصيل الاستلام والتسليم للطلبات المسندة إليه فقط)؛ ولإرسال الرموز والإيصالات والإشعارات؛ وللرد على الدعم؛ وللحفاظ على أمان سهلة (فحوص الاحتيال تُنبّه فريقنا لمراجعة الحسابات المشبوهة ولا تتخذ إجراءً بنفسها)؛ وللوفاء بالتزاماتنا القانونية.',
    ),
    s(
      'Who we share it with',
      'مع من نشاركها',
      'Only what each needs: the other side of a sale (your name and area; a buyer’s delivery address goes to our driver only), Sahla’s drivers, our payment provider, MoDEE’s Sanad service (if you verify), and the services that run Sahla for us: hosting and storage, email delivery, push notifications (Google Firebase), maps for your street (Google), and reading test certificates (Google Cloud Vision). We don’t sell personal data. We share data with authorities only when the law requires it.',
      'فقط ما يحتاجه كل طرف: الطرف الآخر في البيعة (اسمك ومنطقتك؛ عنوان المشتري يذهب لسائقنا فقط)، وسائقو سهلة، ومزوّد الدفع، وخدمة سند من وزارة الاقتصاد الرقمي والريادة (إن وثّقت هويتك)، والخدمات التي تُشغّل سهلة لنا: الاستضافة والتخزين، وإرسال البريد، والإشعارات (Google Firebase)، والخرائط لمعرفة شارعك (Google)، وقراءة شهادات الفحص (Google Cloud Vision). لا نبيع البيانات الشخصية. ولا نشاركها مع الجهات الرسمية إلا عندما يفرض القانون ذلك.',
    ),
    s(
      'Verifying your identity (Sanad)',
      'توثيق هويتك (سند)',
      'Verifying is optional and earns the Verified Seller badge. With your consent each time, Sahla asks Sanad for your full name, your national number and whether your digital ID is valid. We keep only that you are verified and a one-way code made from your national number (so one ID verifies one account) — never the number itself.',
      'التوثيق اختياري ويمنحك شارة البائع الموثّق. بموافقتك في كل مرة، تطلب سهلة من سند اسمك الكامل ورقمك الوطني وصلاحية هويتك الرقمية. نحتفظ فقط بأنك موثّق وبرمز أحادي الاتجاه مشتق من رقمك الوطني (لتوثّق الهوية الواحدة حساباً واحداً) — وليس الرقم نفسه أبداً.',
    ),
    s(
      'How long we keep it',
      'مدة الاحتفاظ',
      'While your account is open, with these limits: phones, addresses and notes on an order are removed 90 days after it ends (the item, names and amounts stay in your history), and a checkout nobody paid for after 30 days. The original photo of a test certificate is removed 180 days after its listing ends (30 days if no listing used it), and a withdrawn listing’s photos after 180 days. Chats are removed a year after the last message once the item is sold or withdrawn; support chats after two years. Listing photos no listing uses are deleted after 24 hours. Technical logs are kept for up to 90 days. When you delete your account, we delete your profile, bank account, listings, photos, chats, notification tokens and blocks, and keep only what the law requires (the amounts of completed payments and orders, with no name, phone or address) for as long as it requires.',
      'طوال فترة فتح حسابك، مع هذه الحدود: تُحذف أرقام الهواتف والعناوين والملاحظات في الطلب بعد 90 يوماً من انتهائه (يبقى المنتج والأسماء والمبالغ في سجلك)، والطلب الذي لم يُدفع بعد 30 يوماً. تُحذف الصورة الأصلية لشهادة الفحص بعد 180 يوماً من انتهاء إعلانها (30 يوماً إن لم يستخدمها إعلان)، وصور الإعلان المسحوب بعد 180 يوماً. تُحذف المحادثات بعد سنة من آخر رسالة إذا بيع المنتج أو سُحب، ومحادثات الدعم بعد سنتين. تُحذف صور الإعلانات غير المستخدمة بعد 24 ساعة. وتُحفظ السجلات التقنية حتى 90 يوماً. عند حذف حسابك نحذف ملفك وحسابك البنكي وإعلاناتك وصورك ومحادثاتك ورموز الإشعارات والحظر، ونحتفظ فقط بما يفرضه القانون (مبالغ المدفوعات والطلبات المكتملة، دون اسم أو هاتف أو عنوان) للمدة التي يفرضها.',
    ),
    s(
      'Your rights',
      'حقوقك',
      'You can see and correct your data in the app, download a copy of it (Profile → Download my data), delete your account (Profile → Delete account; not while an order is open, money is owed to you or you are in a live auction), withdraw a consent you gave, object to a use, and ask us any question through Help & Support or our support email. You can also complain to the authority responsible for personal data protection in Jordan.',
      'يمكنك الاطلاع على بياناتك وتصحيحها في التطبيق، وتنزيل نسخة منها (الملف الشخصي ← تنزيل بياناتي)، وحذف حسابك (الملف الشخصي ← حذف الحساب؛ ليس أثناء وجود طلب مفتوح أو مبلغ مستحق لك أو مشاركتك في مزاد قائم)، وسحب موافقة أعطيتها، والاعتراض على استخدام ما، وأي استفسار عبر «المساعدة والدعم» أو بريد الدعم. ويمكنك أيضاً تقديم شكوى للجهة المختصة بحماية البيانات الشخصية في الأردن.',
    ),
    s(
      'Security and age',
      'الأمان والعمر',
      'We protect your data with encryption in transit, hashed passwords and codes, limited staff access with two-step log-in and an audit log. Sahla is for people 18 and over.',
      'نحمي بياناتك بالتشفير أثناء النقل، وتشفير كلمات المرور والرموز، وصلاحيات محدودة للموظفين مع تسجيل دخول بخطوتين وسجل تدقيق. سهلة مخصصة لمن هم في الثامنة عشرة فما فوق.',
    ),
    s(
      'Changes and contact',
      'التعديلات والتواصل',
      'If we change this policy we will ask you to accept the new version in the app. Questions: Help & Support in the app, or our support email.',
      'إن عدّلنا هذه السياسة سنطلب منك قبول النسخة الجديدة في التطبيق. للاستفسارات: «المساعدة والدعم» في التطبيق، أو بريد الدعم.',
    ),
  ],
};

export const termsOfUse: LegalDoc = {
  title: { en: 'Terms and Conditions', ar: 'الشروط والأحكام' },
  sections: [
    s(
      'Using Sahla',
      'استخدام سهلة',
      'By creating an account you agree to these terms and our Privacy Policy. You must be 18 or over, give true details and keep your password safe. One person, one account.',
      'بإنشاء حساب فإنك توافق على هذه الشروط وعلى سياسة الخصوصية. يجب أن يكون عمرك 18 عاماً فأكثر، وأن تقدّم بيانات صحيحة وتحافظ على كلمة مرورك. شخص واحد، حساب واحد.',
    ),
    s(
      'Listing an item',
      'نشر إعلان',
      'List only items you own and may sell, in Jordan, described honestly with real photos, at least ten words and the right condition. Phones and electronics need a recent test certificate from a shop. Illegal, stolen, counterfeit, dangerous or prohibited items are not allowed. Give a pickup phone and address where our driver can collect the item; buyers never see them. Brand-new stock is not sold on Sahla.',
      'انشر فقط منتجات تملكها ويحق لك بيعها داخل الأردن، بوصف صادق وصور حقيقية وعشر كلمات على الأقل وحالة صحيحة. تحتاج الهواتف والإلكترونيات إلى شهادة فحص حديثة من محل. يُمنع نشر المنتجات غير القانونية أو المسروقة أو المقلّدة أو الخطرة أو المحظورة. أعطِ رقم هاتف وعنوان استلام يمكن لسائقنا الاستلام منه؛ لا يراهما المشترون أبداً. لا تُباع المنتجات الجديدة غير المستعملة على سهلة.',
    ),
    s(
      'Offers and auctions',
      'العروض والمزادات',
      'An accepted offer or a winning bid is a commitment to buy at that price. Sellers can’t withdraw an auction or change what was bid on once it has bids. A bid in the last 45 seconds adds 45 seconds to the auction, up to 5 minutes after the end the seller set. The winner has 48 hours after the auction ends to pay; after that the seller may withdraw the item.',
      'العرض المقبول أو المزايدة الفائزة التزام بالشراء بذلك السعر. لا يمكن للبائع سحب مزاد أو تغيير ما زايد عليه الناس بعد وجود مزايدات. المزايدة في آخر 45 ثانية تضيف 45 ثانية إلى المزاد، وبحد أقصى 5 دقائق بعد موعد الانتهاء الذي حدده البائع. أمام الفائز 48 ساعة بعد انتهاء المزاد ليدفع؛ بعدها يحق للبائع سحب المنتج.',
    ),
    s(
      'Paying and escrow',
      'الدفع والضمان',
      'The buyer pays the item price, buyer protection (3%, at least 1 JOD) and delivery (2 JOD) by card. Sahla holds the money until the buyer gives our driver the 4-digit delivery PIN; then the item price is paid out to the seller. Sahla takes no fee from sellers. Give your PIN only when you have the item and are happy with it.',
      'يدفع المشتري سعر المنتج وحماية المشتري (3٪، بحد أدنى دينار واحد) والتوصيل (ديناران) بالبطاقة. تحتفظ سهلة بالمبلغ حتى يعطي المشتري سائقنا رمز التسليم المكوّن من 4 أرقام؛ عندها يُحوَّل سعر المنتج للبائع. لا تأخذ سهلة أي عمولة من البائع. لا تعطِ الرمز إلا عندما يكون المنتج معك وتكون راضياً عنه.',
    ),
    s(
      'Cancelling, problems and refunds',
      'الإلغاء والمشاكل والاسترداد',
      'A buyer can cancel a paid order until the driver picks the item up, and gets the money back. If something is wrong when the item arrives, don’t give the PIN: report the problem in the app. If a delivery can’t be completed, the driver records why; Sahla’s team then decides to try again or refund the buyer, and may keep a faulty item off sale. Once the PIN is given the sale is complete.',
      'يمكن للمشتري إلغاء طلب مدفوع إلى أن يستلم السائق المنتج، ويُعاد إليه المبلغ. إن وجدت مشكلة عند وصول المنتج فلا تعطِ الرمز: أبلغ عن المشكلة في التطبيق. إن تعذّر إتمام التوصيل يسجّل السائق السبب، ثم يقرر فريق سهلة المحاولة مرة أخرى أو إعادة المبلغ للمشتري، وقد يُبقي المنتج المعيب خارج البيع. بعد إعطاء الرمز تكتمل البيعة.',
    ),
    s(
      'Certified Refurbished stores',
      'متاجر المنتجات المجددة المعتمدة',
      'Refurbished items are sold by the brand or store shown on the listing, at a fixed price, with the warranty stated there. The store, not the person reselling, is responsible for that warranty.',
      'تُباع المنتجات المجددة من العلامة التجارية أو المتجر الظاهر على الإعلان بسعر ثابت وبالكفالة المذكورة فيه. المتجر هو المسؤول عن تلك الكفالة.',
    ),
    s(
      'Behaviour and safety',
      'السلوك والأمان',
      'Be respectful; no scams, harassment or attempts to take payment outside Sahla. You can report listings and users and block people. We may remove listings and suspend accounts that break these terms; suspended accounts can’t sell or buy.',
      'التزم بالاحترام؛ يُمنع الاحتيال والإزعاج ومحاولة الدفع خارج سهلة. يمكنك الإبلاغ عن الإعلانات والمستخدمين وحظر الأشخاص. يحق لنا إزالة الإعلانات وإيقاف الحسابات المخالفة لهذه الشروط؛ ولا يمكن للحسابات الموقوفة البيع أو الشراء.',
    ),
    s(
      'Our responsibility',
      'مسؤوليتنا',
      'Sahla connects buyers and sellers, holds payments and delivers. The seller is responsible for the item and its description. As far as the law allows, Sahla’s responsibility for an order is limited to the amount paid for it.',
      'تربط سهلة بين المشترين والبائعين وتحفظ المدفوعات وتوصل الطلبات. البائع مسؤول عن المنتج ووصفه. وبالقدر الذي يسمح به القانون تقتصر مسؤولية سهلة عن أي طلب على المبلغ المدفوع فيه.',
    ),
    s(
      'Law, changes and contact',
      'القانون والتعديلات والتواصل',
      'These terms are governed by the laws of the Hashemite Kingdom of Jordan. We will ask you to accept changed terms in the app. Contact us through Help & Support or our support email.',
      'تخضع هذه الشروط لقوانين المملكة الأردنية الهاشمية. سنطلب منك قبول الشروط المعدّلة في التطبيق. تواصل معنا عبر «المساعدة والدعم» أو بريد الدعم.',
    ),
  ],
};

export const legalDocs: Record<LegalDocId, LegalDoc> = { privacy: privacyPolicy, terms: termsOfUse };

/** What the person agrees to before Sahla asks Sanad (MoDEE's consent pledge). */
export const sanadConsent: { title: Localized; points: Localized[]; agree: Localized } = {
  title: { en: 'Your consent to verify with Sanad', ar: 'موافقتك على التوثيق عبر سند' },
  points: [
    {
      en: 'Sahla will ask Sanad (Ministry of Digital Economy and Entrepreneurship) for your full name, your national number and whether your digital ID is valid.',
      ar: 'ستطلب سهلة من سند (وزارة الاقتصاد الرقمي والريادة) اسمك الكامل ورقمك الوطني وصلاحية هويتك الرقمية.',
    },
    {
      en: 'Only to verify your identity and show the Verified Seller badge, so one ID verifies one Sahla account.',
      ar: 'فقط للتحقق من هويتك وإظهار شارة البائع الموثّق، لتوثّق الهوية الواحدة حساباً واحداً في سهلة.',
    },
    {
      en: 'We keep only that you are verified and a one-way code from your national number, never the number itself.',
      ar: 'نحتفظ فقط بأنك موثّق وبرمز أحادي الاتجاه مشتق من رقمك الوطني، وليس الرقم نفسه أبداً.',
    },
    {
      en: 'You log in to Sanad yourself; you can stop at any time, and ask us to remove the verification later.',
      ar: 'تسجّل الدخول إلى سند بنفسك؛ ويمكنك التوقف في أي وقت وطلب إزالة التوثيق لاحقاً.',
    },
  ],
  agree: { en: 'I agree that Sahla asks Sanad for these details', ar: 'أوافق على أن تطلب سهلة هذه البيانات من سند' },
};
