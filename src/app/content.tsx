"use client";

import * as openpgp from "openpgp/lightweight";
import { useEffect, useState } from "react";
import { Button } from "../components/button";
import { Input, Select, Textarea } from "../components/input";
import { Table } from "../components/table";
import { useStateAndLocalStorage } from "../hooks/use-local-storage";
import { useModal } from "../hooks/use-modal";

enum KeyType {
  SecPub = "SEC_PUB",
  Pub = "PUB",
}

interface PubKey<WithDetails extends boolean | undefined = undefined> {
  name: string;
  type: KeyType.Pub;
  overview: {
    publicKeyArmored: string;
  };
  details: WithDetails extends false
    ? false
    : WithDetails extends true
    ? {
        pgp: {
          publicKey: openpgp.PublicKey;
        };
      }
    :
        | {
            pgp: {
              publicKey: openpgp.PublicKey;
            };
          }
        | false;
}

interface SecPubKey<WithDetails extends boolean | undefined = undefined> {
  name: string;
  type: KeyType.SecPub;
  overview: {
    publicKeyArmored: string;
    privateKeyArmored: string;
    passphrase: string;
  };
  details: WithDetails extends false
    ? false
    : WithDetails extends true
    ? {
        pgp: {
          publicKey: openpgp.PublicKey;
          privateKey: openpgp.PrivateKey;
        };
      }
    :
        | {
            pgp: {
              publicKey: openpgp.PublicKey;
              privateKey: openpgp.PrivateKey;
            };
          }
        | false;
}

type Key<WithDetails extends boolean | undefined = undefined> =
  | PubKey<WithDetails>
  | SecPubKey<WithDetails>;

export function Content(props: { version: string }) {
  const [vaultEncryptionPassword, setVaultEncryptionPassword] = useState<
    string | null
  >(null);

  const identities = useStateAndLocalStorage<SecPubKey<false>[]>(
    "pgpweb_1__enc_identities",
    {
      encryptionPassword: vaultEncryptionPassword ?? undefined,
      isDisabled: !vaultEncryptionPassword,
      fallback: [],
    }
  );
  const [loadedIdentities, setLoadedIdentities] = useState<
    SecPubKey<true>[] | null
  >(null);

  const contacts = useStateAndLocalStorage<PubKey<false>[]>(
    "pgpweb_1__enc_contacts",
    {
      encryptionPassword: vaultEncryptionPassword ?? undefined,
      isDisabled: !vaultEncryptionPassword,
      fallback: [],
    }
  );
  const [loadedContacts, setLoadedContacts] = useState<PubKey<true>[] | null>(
    null
  );

  const modal = useModal();

  useEffect(() => {
    if (!identities.value || !vaultEncryptionPassword) return;
    setLoadedIdentities([]);

    (async () => {
      const result: SecPubKey<true>[] = [];
      for (const identity of identities.value ?? []) {
        try {
          const publicKey = await openpgp.readKey({
            armoredKey: identity.overview.publicKeyArmored,
          });
          const privateKey = await openpgp.decryptKey({
            privateKey: await openpgp.readPrivateKey({
              armoredKey: identity.overview.privateKeyArmored,
            }),
            passphrase: identity.overview.passphrase,
          });

          result.push({
            name: identity.name,
            type: KeyType.SecPub,
            overview: {
              publicKeyArmored: identity.overview.publicKeyArmored,
              privateKeyArmored: identity.overview.privateKeyArmored,
              passphrase: identity.overview.passphrase,
            },
            details: {
              pgp: {
                publicKey,
                privateKey,
              },
            },
          });
        } catch {}
      }
      setLoadedIdentities(result);
    })();
  }, [identities.value]);

  useEffect(() => {
    if (!contacts.value || !vaultEncryptionPassword) return;
    setLoadedContacts([]);

    (async () => {
      const result: PubKey<true>[] = [];
      for (const contact of contacts.value ?? []) {
        try {
          result.push({
            name: contact.name,
            type: KeyType.Pub,
            overview: {
              publicKeyArmored: contact.overview.publicKeyArmored,
            },
            details: {
              pgp: {
                publicKey: await openpgp.readKey({
                  armoredKey: contact.overview.publicKeyArmored,
                }),
              },
            },
          });
        } catch {}
      }
      setLoadedContacts(result);
    })();
  }, [contacts.value]);

  const joinedLoadedKeys = [
    ...(loadedIdentities ?? []),
    ...(loadedContacts ?? []),
  ];

  console.log(joinedLoadedKeys);

  if (!vaultEncryptionPassword && !modal.isOpen) {
    modal.open({
      title: "Please enter your vault password",
      body: (
        <>
          <label className="mt-2 block">
            <span className="block mb-1">Vault password</span>
            <Input name="vault-password" placeholder="jhk2!JKa!jk1__" />
          </label>
        </>
      ),
      onSubmit(formData) {
        const vaultEncryptionPassword = formData.get(
          "vault-password"
        )! as string;
        setVaultEncryptionPassword(vaultEncryptionPassword);
        document.body.style.overflow = "inherit";
      },
    });
  }

  return (
    <>
      <modal.Modal />

      <nav className="px-8 py-1 border-b border-neutral-300 bg-white flex justify-between">
        <span>pgpweb v{props.version}</span>
        {vaultEncryptionPassword ? (
          <span className="bg-green-500 text-white px-1">Encrypted</span>
        ) : (
          <span className="bg-red-500 text-white px-1">Unencrypted</span>
        )}
      </nav>

      <main className="p-8">
        <div className="flex space-x-4">
          <section className="w-1/2 flex flex-col justify-between">
            <div className="h-96 overflow-y-scroll">
              <h2 className="mb-1">Identities (sec/pub)</h2>
              <Table
                isLoading={!loadedIdentities}
                columns={["Fingerprint", "User IDs", ""]}
                rows={(loadedIdentities ?? []).map((key, i) => [
                  {
                    value: key.details.pgp.publicKey.keyPacket
                      .getFingerprint()
                      .toUpperCase(),
                  },
                  {
                    value: key.details.pgp.publicKey.users
                      .map((user) => {
                        return `${
                          user.userID?.name ||
                          user.userID?.userID ||
                          "[No name]"
                        } <${user.userID?.email || "[No email]"}>`;
                      })
                      .join(", "),
                  },
                  {
                    alignRight: true,
                    value: (
                      <div>
                        <Button
                          className="py-1"
                          onClick={() => {
                            identities.set(
                              (identities.value ?? []).filter((_key) => {
                                const isSame =
                                  _key.overview.publicKeyArmored ===
                                    key.overview.publicKeyArmored &&
                                  _key.name === key.name;
                                return !isSame;
                              })
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    ),
                  },
                ])}
              />
            </div>

            <div className="p-3 bg-neutral-50 border-t border-neutral-300 -mx-3 -mb-3 space-x-2 flex justify-end mt-3">
              <Button
                onClick={() =>
                  modal.open({
                    async onSubmit(formData) {
                      const newKey: SecPubKey<false> = {
                        name: formData.get("name") as string,
                        type: KeyType.SecPub,
                        overview: {
                          publicKeyArmored: formData.get(
                            "public-key"
                          ) as string,
                          privateKeyArmored: formData.get(
                            "private-key"
                          ) as string,
                          passphrase: formData.get("passphrase")! as string,
                        },
                        details: false,
                      };

                      try {
                        await openpgp.readKey({
                          armoredKey: newKey.overview.publicKeyArmored,
                        });
                        await openpgp.decryptKey({
                          privateKey: await openpgp.readPrivateKey({
                            armoredKey: newKey.overview.privateKeyArmored,
                          }),
                          passphrase: newKey.overview.passphrase,
                        });

                        identities.set([...(identities.value ?? []), newKey]);
                      } catch (e) {
                        alert("Error: " + e);
                      }
                    },
                    title: "Import a new key",
                    body: (
                      <>
                        <label className="block">
                          <span className="block mb-1">Name*</span>
                          <Input
                            name="name"
                            placeholder="Secret identity"
                            required
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">Public key*</span>
                          <Textarea
                            name="public-key"
                            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                            required
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">Private key*</span>
                          <Textarea
                            name="private-key"
                            placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
                            required
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">Passphrase*</span>
                          <Input
                            name="passphrase"
                            placeholder="jhk2!JKa!jk1__"
                            required
                          />
                        </label>
                      </>
                    ),
                  })
                }
              >
                Import identity
              </Button>
              <Button
                onClick={() => {
                  modal.open({
                    title: "Generate a new identity",
                    body: (
                      <>
                        <label className="block">
                          <span className="block mb-1">Name*</span>
                          <Input
                            name="name"
                            placeholder="Max Private"
                            required
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">
                            Associated (User ID) name (Public)*
                          </span>
                          <Input
                            name="associated-name"
                            placeholder="Max Public"
                            required
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">
                            Associated (User ID) email (Public)
                          </span>
                          <Input
                            name="associated-email"
                            placeholder="max@public.com"
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">Passphrase*</span>
                          <Input
                            name="passphrase"
                            placeholder="jhk2!JKa!jk1__"
                            required
                          />
                        </label>
                      </>
                    ),
                    async onSubmit(formData) {
                      const name = formData.get("name") as string;
                      const passphrase = formData.get("passphrase") as string;
                      const {
                        privateKey: privateKeyArmored,
                        publicKey: publicKeyArmored,
                      } = await openpgp.generateKey({
                        type: "ecc",
                        curve: "curve25519",
                        userIDs: [
                          {
                            name: formData.get("associated-name") as string,
                            email: formData.get("associated-email") as string,
                          },
                        ],
                        passphrase,
                        format: "armored",
                      });

                      identities.set([
                        ...(identities.value ?? []),
                        {
                          name,
                          type: KeyType.SecPub,
                          overview: {
                            passphrase,
                            privateKeyArmored,
                            publicKeyArmored,
                          },
                          details: false,
                        },
                      ]);
                    },
                  });
                }}
              >
                Generate new
              </Button>
            </div>
          </section>

          <section className="w-1/2 flex flex-col justify-between">
            <div className="h-96 overflow-y-scroll">
              <h2 className="mb-1">Contacts (pub)</h2>
              <Table
                isLoading={!loadedContacts}
                columns={["Fingerprint", "User IDs", ""]}
                rows={(loadedContacts ?? []).map((key) => [
                  {
                    value: key.details.pgp.publicKey.keyPacket
                      .getFingerprint()
                      .toUpperCase(),
                  },
                  {
                    value: key.details.pgp.publicKey.users
                      .map((user) => {
                        return `${
                          user.userID?.name ||
                          user.userID?.userID ||
                          "[No name]"
                        } <${user.userID?.email || "[No email]"}>`;
                      })
                      .join(", "),
                  },
                  {
                    alignRight: true,
                    value: (
                      <div>
                        <Button
                          className="py-1"
                          onClick={() => {
                            contacts.set(
                              (contacts.value ?? []).filter((_key) => {
                                const isSame =
                                  _key.overview.publicKeyArmored ===
                                    key.overview.publicKeyArmored &&
                                  _key.name === key.name;
                                return !isSame;
                              })
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    ),
                  },
                ])}
              />
            </div>

            <div className="p-3 bg-neutral-50 border-t border-neutral-300 -mx-3 -mb-3 flex justify-end mt-3">
              <Button
                onClick={() =>
                  modal.open({
                    async onSubmit(formData) {
                      const newContact: PubKey<false> = {
                        name: formData.get("name") as string,
                        type: KeyType.Pub,
                        overview: {
                          publicKeyArmored: formData.get(
                            "public-key"
                          ) as string,
                        },
                        details: false,
                      };

                      try {
                        await openpgp.readKey({
                          armoredKey: newContact.overview.publicKeyArmored,
                        });

                        contacts.set([...(contacts.value ?? []), newContact]);
                      } catch (e) {
                        alert("Error: " + e);
                      }
                    },
                    title: "Import a new contact",
                    body: (
                      <>
                        <label className="block">
                          <span className="block mb-1">Name*</span>
                          <Input
                            name="name"
                            placeholder="Joe Fisher"
                            required
                          />
                        </label>

                        <label className="mt-2 block">
                          <span className="block mb-1">Public key*</span>
                          <Textarea
                            name="public-key"
                            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
                            required
                          />
                        </label>
                      </>
                    ),
                  })
                }
              >
                Import contact
              </Button>
            </div>
          </section>
        </div>

        <section className="mt-6">
          <h2 className="mb-1">Messages</h2>

          <div className="space-x-2 p-3 bg-neutral-50 border-t border-neutral-300 -mx-3 -mb-3 flex justify-end mt-3">
            <Button
              onClick={() =>
                modal.open({
                  async onSubmit(formData) {
                    try {
                      const message = await openpgp.createMessage({
                        text: formData.get("text")!,
                      });
                      const senderLoadedKey = loadedIdentities?.find(
                        (contact) => {
                          return (
                            contact.overview.publicKeyArmored ===
                            formData.get("sender-public-key-armored")
                          );
                        }
                      );
                      const recipientLoadedKey = joinedLoadedKeys.find(
                        (contact) => {
                          return (
                            contact.overview.publicKeyArmored ===
                            formData.get("recipient-public-key-armored")
                          );
                        }
                      );
                      if (!senderLoadedKey || !recipientLoadedKey) {
                        throw new Error("Could not find key");
                      }

                      const encrypted = await openpgp.encrypt({
                        message,
                        encryptionKeys: [
                          recipientLoadedKey.details.pgp.publicKey,
                          senderLoadedKey.details.pgp.publicKey,
                        ],
                        signingKeys: senderLoadedKey.details.pgp.privateKey,
                      });

                      modal.open({
                        title: "Your encrypted message",
                        body: (
                          <label className="block">
                            <Textarea rows={10} value={String(encrypted)} />
                          </label>
                        ),
                      });
                    } catch (e) {
                      alert("Error: " + e);
                    }
                  },
                  title: "Encrypt message",
                  body: (
                    <>
                      <label className="block">
                        <span className="block mb-1">Message*</span>
                        <Textarea
                          name="text"
                          placeholder="Hello World"
                          required
                        />
                      </label>

                      <label className="mt-2 block">
                        <span className="block mb-1">Sender*</span>
                        <Select name="sender-public-key-armored">
                          {(loadedIdentities ?? []).map((key) => {
                            return (
                              <option value={key.overview.publicKeyArmored}>
                                {`${key.details.pgp.publicKey
                                  .getFingerprint()
                                  .toUpperCase()} (${
                                  key.type === KeyType.SecPub
                                    ? "Identity"
                                    : "Contact"
                                })`}
                              </option>
                            );
                          })}
                        </Select>
                      </label>

                      <label className="mt-2 block">
                        <span className="block mb-1">Recipient*</span>
                        <Select name="recipient-public-key-armored">
                          {joinedLoadedKeys.map((key) => {
                            return (
                              <option value={key.overview.publicKeyArmored}>
                                {`${key.details.pgp.publicKey
                                  .getFingerprint()
                                  .toUpperCase()} (${
                                  key.type === KeyType.SecPub
                                    ? "Identity"
                                    : "Contact"
                                })`}
                              </option>
                            );
                          })}
                        </Select>
                      </label>
                    </>
                  ),
                })
              }
              className="mt-2"
            >
              Encrypt message
            </Button>

            <Button
              onClick={() =>
                modal.open({
                  async onSubmit(formData) {
                    try {
                      const message = await openpgp.readMessage({
                        armoredMessage: formData.get("encrypted-message")!,
                      });
                      const recipientLoadedKey = loadedIdentities?.find(
                        (contact) => {
                          return (
                            contact.overview.publicKeyArmored ===
                            formData.get("recipient-public-key-armored")
                          );
                        }
                      );
                      const senderLoadedKey = joinedLoadedKeys.find(
                        (contact) => {
                          return (
                            contact.overview.publicKeyArmored ===
                            formData.get("sender-public-key-armored")
                          );
                        }
                      );

                      if (!recipientLoadedKey || !senderLoadedKey) {
                        throw new Error("Could not find key");
                      }

                      const { data: decrypted, signatures: _signatures } =
                        await openpgp.decrypt({
                          message,
                          decryptionKeys:
                            recipientLoadedKey.details.pgp.privateKey,
                          expectSigned: true,
                          verificationKeys:
                            senderLoadedKey.details.pgp.publicKey,
                        });

                      modal.open({
                        title: "Your decrypted message",
                        body: (
                          <label className="block">
                            <Textarea rows={10} value={String(decrypted)} />
                          </label>
                        ),
                      });
                    } catch (e) {
                      alert("Error: " + e);
                    }
                  },
                  title: "Decrypt message",
                  body: (
                    <>
                      <label className="block">
                        <span className="block mb-1">Encrypted message*</span>
                        <Textarea
                          name="encrypted-message"
                          placeholder="-----BEGIN PGP MESSAGE-----"
                          required
                        />
                      </label>

                      <label className="mt-2 block">
                        <span className="block mb-1">Sender*</span>
                        <Select name="sender-public-key-armored">
                          {(joinedLoadedKeys ?? []).map((key) => {
                            return (
                              <option value={key.overview.publicKeyArmored}>
                                {`${key.details.pgp.publicKey
                                  .getFingerprint()
                                  .toUpperCase()} (${
                                  key.type === KeyType.SecPub
                                    ? "Identity"
                                    : "Contact"
                                })`}
                              </option>
                            );
                          })}
                        </Select>
                      </label>

                      <label className="mt-2 block">
                        <span className="block mb-1">Recipient*</span>
                        <Select name="recipient-public-key-armored">
                          {(loadedIdentities ?? []).map((key) => {
                            return (
                              <option value={key.overview.publicKeyArmored}>
                                {`${key.details.pgp.publicKey
                                  .getFingerprint()
                                  .toUpperCase()} (${
                                  key.type === KeyType.SecPub
                                    ? "Identity"
                                    : "Contact"
                                })`}
                              </option>
                            );
                          })}
                        </Select>
                      </label>
                    </>
                  ),
                })
              }
              className="mt-2"
            >
              Decrypt message
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
